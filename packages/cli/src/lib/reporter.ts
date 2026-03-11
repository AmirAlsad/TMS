import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import type { Classification, Message } from '@tms/shared';
import type { SpecResult, RunReport } from './types.js';

function classificationColor(classification: Classification): (text: string) => string {
  switch (classification) {
    case 'passed':
      return chalk.green;
    case 'failed':
      return chalk.red;
    case 'needs_review':
      return chalk.yellow;
  }
}

function classificationLabel(classification: Classification): string {
  const color = classificationColor(classification);
  return color(classification.toUpperCase());
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function printSummaryTable(results: SpecResult[]): void {
  console.log();
  console.log(chalk.bold('Results'));
  console.log(chalk.dim('─'.repeat(80)));

  const nameWidth = Math.max(20, ...results.map((r) => r.evalResult.specName.length));

  for (const result of results) {
    const { evalResult, durationMs } = result;
    const name = evalResult.specName.padEnd(nameWidth);
    const classification = evalResult.classification
      ? classificationLabel(evalResult.classification)
      : chalk.dim('N/A');
    const reqTotal = evalResult.requirements.length;
    const reqPassed = evalResult.requirements.filter((r) => r.classification === 'passed').length;
    const duration = chalk.dim(formatDuration(durationMs));

    const errorTag = evalResult.error ? ' ' + chalk.red('ERROR') : '';
    console.log(`  ${name}  ${classification}${errorTag}  ${reqPassed}/${reqTotal} requirements  ${duration}`);
  }

  console.log(chalk.dim('─'.repeat(80)));
}

export function printSummary(report: RunReport): void {
  const { summary } = report;
  console.log();
  console.log(chalk.bold('Summary'));
  console.log(`  Total:        ${summary.total}`);
  console.log(`  Passed:       ${chalk.green(String(summary.passed))}`);
  console.log(`  Failed:       ${chalk.red(String(summary.failed))}`);
  console.log(`  Needs Review: ${chalk.yellow(String(summary.needsReview))}`);
  console.log(`  Duration:     ${formatDuration(report.durationMs)}`);
  console.log();

  const overallColor = classificationColor(report.overallClassification);
  console.log(`  Overall: ${overallColor(report.overallClassification.toUpperCase())}`);
  console.log();
}

export function printDetailedResult(result: SpecResult): void {
  const { evalResult } = result;
  console.log();
  console.log(chalk.bold(`── ${evalResult.specName} ──`));
  console.log(
    `  Status: ${evalResult.classification ? classificationLabel(evalResult.classification) : chalk.dim('N/A')}`,
  );
  console.log(`  Duration: ${formatDuration(result.durationMs)}`);

  if (evalResult.requirements.length > 0) {
    console.log();
    console.log(chalk.bold('  Requirements:'));
    for (const req of evalResult.requirements) {
      const icon =
        req.classification === 'passed'
          ? chalk.green('PASS')
          : req.classification === 'failed'
            ? chalk.red('FAIL')
            : chalk.yellow('REVIEW');
      console.log(`    [${icon}] ${req.description}`);
      if (req.reasoning) {
        console.log(chalk.dim(`           ${req.reasoning}`));
      }
    }
  }

  if (evalResult.transcript.length > 0) {
    console.log();
    console.log(chalk.bold('  Transcript:'));
    printTranscript(evalResult.transcript);
  }
}

function printTranscript(messages: Message[]): void {
  for (const msg of messages) {
    const role = msg.role === 'user' ? chalk.blue('USER') : chalk.magenta('BOT ');
    console.log(`    ${role}: ${msg.content}`);
  }
}

function wordWrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n' + indent);
}

export function printFailureDetails(results: SpecResult[]): void {
  const nonPassing = results.filter(
    (r) => r.evalResult.classification && r.evalResult.classification !== 'passed',
  );
  if (nonPassing.length === 0) return;

  console.log();
  console.log(chalk.bold('Failure Details'));

  for (const result of nonPassing) {
    const { evalResult } = result;
    console.log(chalk.bold(`── ${evalResult.specName} ──`));

    if (evalResult.error) {
      console.log(chalk.red(`  Error: ${evalResult.error}`));
    }

    const actionable = evalResult.requirements.filter(
      (r) => r.classification === 'failed' || r.classification === 'needs_review',
    );
    for (const req of actionable) {
      const icon =
        req.classification === 'failed' ? chalk.red('[FAIL]') : chalk.yellow('[REVIEW]');
      console.log(`  ${icon} ${req.description}`);
      if (req.reasoning) {
        const indent = '         ';
        const wrapped = wordWrap(req.reasoning, 90, indent);
        console.log(chalk.dim(`${indent}${wrapped}`));
      }
    }

    console.log();
  }
}

export function printResultPaths(results: SpecResult[]): void {
  if (results.length === 0) return;

  console.log(chalk.dim('Results saved to:'));
  for (const result of results) {
    console.log(chalk.dim(`  eval-results/${result.evalResult.id}.json`));
  }
  console.log();
}

export function writeJsonReport(report: RunReport, outputPath: string): void {
  const resolved = path.resolve(outputPath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolved, JSON.stringify(report, null, 2) + '\n');
  console.log(chalk.dim(`Report written to ${resolved}`));
}
