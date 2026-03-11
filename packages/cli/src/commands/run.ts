import type { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, loadEvalSuite, getAllSpecHistories } from '@tms/server/services';
import { loadSpec, resolveSpecPath } from '../lib/spec-loader.js';
import { runSpecs } from '../lib/runner.js';
import {
  printSummaryTable,
  printSummary,
  printDetailedResult,
  printFailureDetails,
  printResultPaths,
  writeJsonReport,
} from '../lib/reporter.js';
import type { RunOptions } from '../lib/types.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Run evaluation specs headlessly')
    .argument('[specs...]', 'Spec file paths or names (looks in evals/ by default)')
    .option('-o, --output <path>', 'Write JSON report to file')
    .option('--json', 'Output results as JSON to stdout')
    .option('--verbose', 'Show detailed transcript output')
    .option('-c, --config <path>', 'Path to config file')
    .option('--parallel', 'Run specs concurrently')
    .option('-s, --suite <name>', 'Run a named suite from evals/suites/')
    .option('--runs <n>', 'Repeat each spec N times for comparative runs', parseInt)
    .option('--check-regression', 'Check for regressions after running (exit code 3)')
    .action(async (specInputs: string[], opts: RunOptions) => {
      try {
        if (opts.config) {
          process.env.TMS_CONFIG_PATH = opts.config;
        }
        const config = loadConfig();

        // If --suite is provided, load suite specs
        if (opts.suite) {
          const suite = await loadEvalSuite(opts.suite);
          if (specInputs.length === 0) {
            specInputs = suite.specs;
            console.log(`Running suite "${suite.name}": ${suite.description}\n`);
          } else {
            // Merge: suite specs first, then explicit specs
            specInputs = [...suite.specs, ...specInputs];
            console.log(
              `Running suite "${suite.name}" + ${specInputs.length - suite.specs.length} additional spec(s)\n`,
            );
          }
        }

        if (specInputs.length === 0) {
          console.error('Error: No specs provided. Use <specs...> or --suite <name>.');
          process.exit(1);
        }

        // Resolve and load all specs
        const specs = [];
        for (const input of specInputs) {
          const specPath = resolveSpecPath(input);
          const spec = await loadSpec(input);
          specs.push({ spec, specPath });
        }

        // --runs: repeat each spec N times
        if (opts.runs && opts.runs > 1) {
          const runCount = Math.min(Math.max(opts.runs, 2), 20);
          const original = [...specs];
          specs.length = 0;
          for (const entry of original) {
            for (let i = 0; i < runCount; i++) {
              specs.push(entry);
            }
          }
          console.log(`Comparative mode: each spec repeated ${runCount} times`);
        }

        console.log(`Running ${specs.length} eval(s)...\n`);

        const report = await runSpecs(specs, config, opts);

        // Output results
        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printSummaryTable(report.results);
          if (opts.verbose) {
            for (const result of report.results) {
              printDetailedResult(result);
            }
          } else {
            printFailureDetails(report.results);
          }
          printSummary(report);
          printResultPaths(report.results);
        }

        // Write report file if requested
        if (opts.output) {
          writeJsonReport(report, opts.output);
        }

        // Aggregate pass rates when using --runs
        if (opts.runs && opts.runs > 1) {
          const specGroups = new Map<string, { passed: number; total: number }>();
          for (const r of report.results) {
            const name = r.evalResult.specName;
            const entry = specGroups.get(name) ?? { passed: 0, total: 0 };
            entry.total++;
            if (r.evalResult.classification === 'passed') entry.passed++;
            specGroups.set(name, entry);
          }
          console.log(chalk.bold('Comparative Pass Rates'));
          for (const [name, { passed: p, total }] of specGroups) {
            const rate = total > 0 ? p / total : 0;
            const color = rate >= 0.8 ? chalk.green : rate >= 0.5 ? chalk.yellow : chalk.red;
            console.log(`  ${name}: ${color(`${p}/${total}`)} (${Math.round(rate * 100)}%)`);
          }
          console.log();
        }

        // --check-regression: load history and check for regressions
        if (opts.checkRegression) {
          const histories = await getAllSpecHistories();
          const regressions = histories.filter((h) => h.regression);
          if (regressions.length > 0) {
            console.log(chalk.red.bold('REGRESSION DETECTED'));
            for (const h of regressions) {
              console.log(
                chalk.red(
                  `  ${h.specName}: recent ${Math.round(h.recentPassRate * 100)}% vs previous ${Math.round(h.previousPassRate * 100)}%`,
                ),
              );
            }
            console.log();
            process.exit(3);
          } else {
            console.log(chalk.green('No regressions detected.\n'));
          }
        }

        // Exit with appropriate code
        switch (report.overallClassification) {
          case 'passed':
            process.exit(0);
            break;
          case 'failed':
            process.exit(1);
            break;
          case 'needs_review':
            process.exit(2);
            break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });
}
