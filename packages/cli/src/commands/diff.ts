import type { Command } from 'commander';
import chalk from 'chalk';
import { getEvalResult, diffEvalResults } from '@tms/server/services';

export function registerDiffCommand(program: Command): void {
  program
    .command('diff')
    .description('Compare two eval results and show differences')
    .argument('<result1>', 'First eval result ID or file path')
    .argument('<result2>', 'Second eval result ID or file path')
    .option('--json', 'Output diff as JSON to stdout')
    .action(async (idA: string, idB: string, opts: { json?: boolean }) => {
      try {
        const resultA = await getEvalResult(idA);
        const resultB = await getEvalResult(idB);

        if (!resultA) {
          console.error(`Error: Eval result "${idA}" not found`);
          process.exit(1);
        }
        if (!resultB) {
          console.error(`Error: Eval result "${idB}" not found`);
          process.exit(1);
        }

        const diff = diffEvalResults(resultA, resultB);

        if (opts.json) {
          console.log(JSON.stringify(diff, null, 2));
          return;
        }

        // Pretty-print the diff
        console.log();
        console.log(chalk.bold('Eval Diff'));
        console.log(chalk.dim('─'.repeat(80)));
        console.log(`  A: ${chalk.cyan(diff.idA)} (${diff.specNameA})`);
        console.log(`  B: ${chalk.cyan(diff.idB)} (${diff.specNameB})`);
        console.log();

        // Classification change
        const classA = diff.classificationA ?? 'N/A';
        const classB = diff.classificationB ?? 'N/A';
        if (classA !== classB) {
          console.log(
            `  Classification: ${colorClassification(classA)} -> ${colorClassification(classB)}`,
          );
        } else {
          console.log(`  Classification: ${colorClassification(classA)} (no change)`);
        }

        // Transcript divergence
        if (diff.divergencePoint >= 0) {
          console.log(
            `  Transcript diverged at turn ${chalk.yellow(String(Math.ceil((diff.divergencePoint + 1) / 2)))} (message index ${diff.divergencePoint})`,
          );
        } else {
          console.log(`  Transcripts: ${chalk.green('identical content')}`);
        }

        console.log(
          `  Transcript lengths: ${diff.transcriptLengthA} messages (A) vs ${diff.transcriptLengthB} messages (B)`,
        );

        // Requirement diffs
        const changed = diff.requirementDiffs.filter((r) => r.changed);
        if (changed.length > 0) {
          console.log();
          console.log(chalk.bold(`  Requirement Changes (${changed.length}):`));
          for (const req of changed) {
            const a = req.classificationA ?? 'N/A';
            const b = req.classificationB ?? 'N/A';
            console.log(`    ${colorClassification(a)} -> ${colorClassification(b)}: ${req.description}`);
            if (req.reasoningB) {
              console.log(chalk.dim(`      B reasoning: ${req.reasoningB.slice(0, 120)}`));
            }
          }
        } else {
          console.log(`  Requirements: ${chalk.green('no classification changes')}`);
        }

        // Token usage delta
        if (diff.tokenUsageDelta) {
          console.log();
          console.log(chalk.bold('  Token Usage Delta:'));
          const d = diff.tokenUsageDelta;
          console.log(`    Prompt:     ${formatDelta(d.promptTokens)} tokens`);
          console.log(`    Completion: ${formatDelta(d.completionTokens)} tokens`);
          console.log(`    Total:      ${formatDelta(d.totalTokens)} tokens`);
        }

        if (diff.costDelta != null) {
          const color = diff.costDelta > 0 ? chalk.red : diff.costDelta < 0 ? chalk.green : chalk.dim;
          console.log(`    Cost:       ${color(formatDelta(diff.costDelta, '$'))}`);
        }

        console.log();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });
}

function colorClassification(c: string): string {
  if (c === 'passed') return chalk.green(c);
  if (c === 'failed') return chalk.red(c);
  if (c === 'needs_review') return chalk.yellow(c);
  return chalk.dim(c);
}

function formatDelta(n: number, prefix = ''): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const absVal = Math.abs(n);
  const formatted = prefix ? `${prefix}${absVal.toFixed(4)}` : String(absVal);
  return `${sign}${formatted}`;
}
