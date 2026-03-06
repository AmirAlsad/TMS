import fs from 'node:fs';
import path from 'node:path';

let cached: string | undefined;

export function findProjectRoot(): string {
  if (cached) return cached;

  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      cached = dir;
      return dir;
    }
    dir = path.dirname(dir);
  }

  // Fallback to cwd if no workspace root found
  return process.cwd();
}
