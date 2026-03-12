import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEST_ROOT = '/tmp/tms-test-evals-root';

// Mock findProjectRoot before eval-spec-loader is imported (it calls findProjectRoot at top level)
vi.mock('../services/project-root.js', () => ({
  findProjectRoot: () => TEST_ROOT,
}));

// Dynamic import so the mock is in place before the module-level EVALS_DIR is computed
const { loadEvalSpec, listEvalSpecs } = await import('../services/eval-spec-loader.js');

describe('eval-spec-loader', () => {
  beforeEach(() => {
    const evalsDir = path.join(TEST_ROOT, 'evals');
    fs.mkdirSync(evalsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('loads a valid spec', async () => {
    const evalsDir = path.join(TEST_ROOT, 'evals');
    fs.writeFileSync(
      path.join(evalsDir, 'test.yaml'),
      `
name: test
description: Test spec
channel: sms
userBot:
  goal: Test the bot
  persona: Casual user
requirements:
  - Bot should respond
turnLimit: 3
`,
    );

    const spec = await loadEvalSpec('test');
    expect(spec.name).toBe('test');
    expect(spec.turnLimit).toBe(3);
  });

  it('throws on missing spec file', async () => {
    await expect(loadEvalSpec('nonexistent')).rejects.toThrow();
  });

  it('throws on invalid spec content', async () => {
    const evalsDir = path.join(TEST_ROOT, 'evals');
    fs.writeFileSync(
      path.join(evalsDir, 'bad.yaml'),
      `
name: bad
description: Missing required fields
`,
    );

    await expect(loadEvalSpec('bad')).rejects.toThrow();
  });

  it('merges defaults.yaml into specs', async () => {
    const evalsDir = path.join(TEST_ROOT, 'evals');
    fs.writeFileSync(path.join(evalsDir, 'defaults.yaml'), 'channel: whatsapp\nturnLimit: 10\n');
    fs.writeFileSync(
      path.join(evalsDir, 'child.yaml'),
      `
name: child
description: Child spec
userBot:
  goal: Test
  persona: User
requirements:
  - Must work
`,
    );

    const spec = await loadEvalSpec('child');
    expect(spec.channel).toBe('whatsapp');
    expect(spec.turnLimit).toBe(10);
  });

  it('spec fields override defaults', async () => {
    const evalsDir = path.join(TEST_ROOT, 'evals');
    fs.writeFileSync(path.join(evalsDir, 'defaults.yaml'), 'channel: sms\nturnLimit: 10\n');
    fs.writeFileSync(
      path.join(evalsDir, 'override.yaml'),
      `
name: override
description: Override spec
channel: whatsapp
userBot:
  goal: Test
  persona: User
requirements:
  - Must work
turnLimit: 5
`,
    );

    const spec = await loadEvalSpec('override');
    expect(spec.channel).toBe('whatsapp');
    expect(spec.turnLimit).toBe(5);
  });

  it('supports extends chain', async () => {
    const evalsDir = path.join(TEST_ROOT, 'evals');
    fs.writeFileSync(
      path.join(evalsDir, 'base.yaml'),
      `
name: base
description: Base spec
channel: sms
userBot:
  goal: Base goal
  persona: Base user
requirements:
  - Base requirement
turnLimit: 5
`,
    );
    fs.writeFileSync(
      path.join(evalsDir, 'child.yaml'),
      `
extends: base
name: child
description: Child spec
userBot:
  goal: Child goal
  persona: Child user
requirements:
  - Child requirement
`,
    );

    const spec = await loadEvalSpec('child');
    expect(spec.name).toBe('child');
    expect(spec.turnLimit).toBe(5); // inherited from base
    expect(spec.userBot.goal).toBe('Child goal'); // overridden
  });

  it('detects circular extends', async () => {
    const evalsDir = path.join(TEST_ROOT, 'evals');
    fs.writeFileSync(
      path.join(evalsDir, 'a.yaml'),
      `
extends: b
name: a
description: A
channel: sms
userBot:
  goal: g
  persona: p
requirements:
  - r
turnLimit: 1
`,
    );
    fs.writeFileSync(
      path.join(evalsDir, 'b.yaml'),
      `
extends: a
name: b
description: B
channel: sms
userBot:
  goal: g
  persona: p
requirements:
  - r
turnLimit: 1
`,
    );

    await expect(loadEvalSpec('a')).rejects.toThrow(/[Cc]ircular/);
  });

  it('lists specs excluding defaults', async () => {
    const evalsDir = path.join(TEST_ROOT, 'evals');
    fs.writeFileSync(path.join(evalsDir, 'defaults.yaml'), 'channel: sms');
    fs.writeFileSync(path.join(evalsDir, 'spec1.yaml'), 'name: spec1');
    fs.writeFileSync(path.join(evalsDir, 'spec2.yaml'), 'name: spec2');

    const specs = await listEvalSpecs();
    expect(specs).toContain('spec1');
    expect(specs).toContain('spec2');
    expect(specs).not.toContain('defaults');
  });
});
