import { exec } from 'node:child_process';
import type { HookResult } from '@tms/shared';

const DEFAULT_TIMEOUT_MS = 30_000;

export function runHook(command: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<HookResult> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `Hook failed (exit ${error.code ?? 'unknown'}): ${error.message}\nstdout: ${stdout}\nstderr: ${stderr}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
