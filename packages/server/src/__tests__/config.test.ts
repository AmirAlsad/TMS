import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

// Mock findProjectRoot to return a temp directory
vi.mock('../services/project-root.js', () => ({
  findProjectRoot: () => '/tmp/tms-test-config',
}));

// Import after mock is set up
const { loadConfig } = await import('../services/config.js');

describe('loadConfig', () => {
  beforeEach(() => {
    if (!fs.existsSync('/tmp/tms-test-config')) {
      fs.mkdirSync('/tmp/tms-test-config', { recursive: true });
    }
  });

  afterEach(() => {
    try {
      fs.unlinkSync('/tmp/tms-test-config/tms.config.yaml');
    } catch {
      // file may not exist
    }
    try {
      fs.unlinkSync('/tmp/tms-test-config/tms.config.json');
    } catch {
      // file may not exist
    }
  });

  it('returns default config when no file exists', () => {
    const config = loadConfig();
    expect(config.bot.endpoint).toBe('http://localhost:3000/chat');
    expect(config.server?.port).toBe(4000);
  });

  it('loads YAML config', () => {
    fs.writeFileSync(
      '/tmp/tms-test-config/tms.config.yaml',
      `
bot:
  endpoint: http://localhost:5000/api
  timeoutMs: 30000
server:
  port: 8080
`,
    );
    const config = loadConfig();
    expect(config.bot.endpoint).toBe('http://localhost:5000/api');
    expect(config.bot.timeoutMs).toBe(30000);
    expect(config.server?.port).toBe(8080);
  });

  it('interpolates env vars', () => {
    process.env.TEST_BOT_URL = 'http://testbot:3000/chat';
    fs.writeFileSync(
      '/tmp/tms-test-config/tms.config.yaml',
      `
bot:
  endpoint: \${TEST_BOT_URL}
`,
    );
    const config = loadConfig();
    expect(config.bot.endpoint).toBe('http://testbot:3000/chat');
    delete process.env.TEST_BOT_URL;
  });

  it('throws on invalid config', () => {
    fs.writeFileSync(
      '/tmp/tms-test-config/tms.config.yaml',
      `
bot:
  endpoint: not-a-valid-url
`,
    );
    expect(() => loadConfig()).toThrow();
  });
});
