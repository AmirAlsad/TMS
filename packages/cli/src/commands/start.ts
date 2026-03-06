import type { Command } from 'commander';
import { createServer } from '@tms/server/server';
import { loadConfig } from '@tms/server/services';
import { DEFAULT_PORT } from '@tms/shared';

export function registerStartCommand(program: Command): void {
  program
    .command('start')
    .description('Start the TMS server')
    .option('-p, --port <port>', 'Server port', String(DEFAULT_PORT))
    .option('-c, --config <path>', 'Path to config file')
    .action((options: { port: string; config?: string }) => {
      const port = parseInt(options.port, 10);
      if (isNaN(port)) {
        console.error(`Invalid port: ${options.port}`);
        process.exit(1);
      }

      if (options.config) {
        process.env.TMS_CONFIG_PATH = options.config;
      }

      const config = loadConfig();
      config.server = { ...config.server, port };

      const { server, wss } = createServer(config);

      const shutdown = () => {
        console.log('\nShutting down...');
        wss.close(() => {
          server.close(() => {
            process.exit(0);
          });
        });
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      server.listen(port, () => {
        console.log(`TMS server running on http://localhost:${port}`);
      });
    });
}
