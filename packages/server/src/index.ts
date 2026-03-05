import { createServer } from './server.js';
import { DEFAULT_PORT } from '@tms/shared';
import { loadConfig } from './services/config.js';

const config = loadConfig();
const port = config.server?.port ?? DEFAULT_PORT;

const { server } = createServer(config);

server.listen(port, () => {
  console.log(`TMS server running on http://localhost:${port}`);
});
