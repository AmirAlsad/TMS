import { Command } from 'commander';

const program = new Command();

program
  .name('tms')
  .description('Text Messaging Simulator — test and evaluate conversational AI')
  .version('0.1.0');

program
  .command('start')
  .description('Start the TMS server and open the UI')
  .option('-p, --port <port>', 'Server port', '4000')
  .action((_options) => {
    // Phase 4: launch server + open browser
    console.log('TMS start is not yet implemented. Use `pnpm dev` from the project root.');
  });

program
  .command('run')
  .description('Run an evaluation spec')
  .argument('<spec>', 'Path to the YAML evaluation spec')
  .action((_spec) => {
    // Phase 4: headless eval runner
    console.log('TMS run is not yet implemented.');
  });

program.parse();
