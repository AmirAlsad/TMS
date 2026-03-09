import type { Command } from 'commander';
import { loadConfig, loadEvalSuite } from '@tms/server/services';
import { loadSpec, resolveSpecPath } from '../lib/spec-loader.js';
import { runSpecs } from '../lib/runner.js';
import {
  printSummaryTable,
  printSummary,
  printDetailedResult,
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
          }
          printSummary(report);
        }

        // Write report file if requested
        if (opts.output) {
          writeJsonReport(report, opts.output);
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
