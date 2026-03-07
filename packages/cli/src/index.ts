import dotenv from 'dotenv';
import { Command } from 'commander';
import { findProjectRoot } from '@tms/server/services';
import { registerStartCommand } from './commands/start.js';
import { registerRunCommand } from './commands/run.js';

dotenv.config({ path: `${findProjectRoot()}/.env` });

const program = new Command();

program
  .name('tms')
  .description('Text Messaging Simulator — test and evaluate conversational AI')
  .version('0.1.0');

registerStartCommand(program);
registerRunCommand(program);

program.parse();
