import dotenv from 'dotenv';
import { createServer } from './server.js';
import { DEFAULT_PORT } from '@tms/shared';
import { loadConfig } from './services/config.js';
import { findProjectRoot } from './services/project-root.js';

dotenv.config({ path: `${findProjectRoot()}/.env` });

const config = loadConfig();
const port = config.server?.port ?? DEFAULT_PORT;

const { server } = createServer(config);

server.listen(port, () => {
  console.log(`TMS server running on http://localhost:${port}`);
});
