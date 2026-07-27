import { spawn } from 'node:child_process';
import * as path from 'node:path';

import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import type { ProviderHost } from '../../../core/providers/ProviderHost';
import { getEnhancedPath, parseEnvironmentVariables } from '../../../utils/env';
import { getVaultPath } from '../../../utils/path';
import {
  resolveWindowsCmdShimSpawnSpec,
  terminateSpawnedProcess,
} from '../../../utils/windowsCmdShim';
import type { CommandCodeModel } from '../settings';

const ANSI_ESCAPE_SEQUENCE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  'g',
);

export class CommandCodeModelDiscoveryService {
  constructor(private readonly plugin: ProviderHost) {}

  async discoverModels(): Promise<CommandCodeModel[]> {
    const command = await this.plugin.getResolvedProviderCliPath('commandcode') ?? 'cmd';
    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const envVars = parseEnvironmentVariables(
      getRuntimeEnvironmentText(this.plugin.settings, 'commandcode'),
    );
    const env = {
      ...process.env,
      ...envVars,
      PATH: getEnhancedPath(envVars.PATH, path.isAbsolute(command) ? command : undefined),
    };
    const spec = resolveWindowsCmdShimSpawnSpec({
      args: ['--list-models', '--no-auto-update'],
      command,
    });

    return new Promise((resolve, reject) => {
      const child = spawn(spec.command, spec.args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        ...(spec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (action: () => void): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        action();
      };
      const timeout = window.setTimeout(() => {
        terminateSpawnedProcess(child, 'SIGKILL', spawn, spec);
        finish(() => reject(new Error('Command Code model discovery timed out.')));
      }, 20_000);
      child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
      child.once('error', error => finish(() => reject(error)));
      child.once('close', (code) => {
        if (code !== 0) {
          finish(() => reject(new Error(
            stderr.trim() || `Command Code model discovery exited with code ${code}.`,
          )));
          return;
        }
        finish(() => resolve(parseCommandCodeModels(stdout)));
      });
    });
  }
}

export function parseCommandCodeModels(output: string): CommandCodeModel[] {
  const models: CommandCodeModel[] = [];
  let group = '';
  for (const rawLine of output.replace(ANSI_ESCAPE_SEQUENCE, '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.startsWith('Available models')) continue;
    if (line.startsWith('Pass the full id') || line.startsWith('Docs:')) break;

    const match = line.match(/^(\S+)\s{2,}(.+)$/);
    if (match) {
      models.push({
        description: match[2].trim(),
        ...(group ? { group } : {}),
        rawId: match[1],
      });
      continue;
    }
    group = line.trim();
  }
  return models;
}
