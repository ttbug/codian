import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';
import type { HostnameCliPaths } from '../../core/types/settings';

export interface CommandCodeModel {
  description?: string;
  group?: string;
  rawId: string;
}

export interface CommandCodeProviderSettings {
  cliPath: string;
  cliPathsByHost: HostnameCliPaths;
  discoveredModels: CommandCodeModel[];
  enabled: boolean;
  environmentVariables: string;
  visibleModels: string[];
}

export const DEFAULT_COMMAND_CODE_PROVIDER_SETTINGS: Readonly<CommandCodeProviderSettings> = Object.freeze({
  cliPath: '',
  cliPathsByHost: {},
  discoveredModels: [],
  enabled: false,
  environmentVariables: '',
  visibleModels: [],
});

export function getCommandCodeProviderSettings(
  settings: Record<string, unknown>,
): CommandCodeProviderSettings {
  const config = getProviderConfig(settings, 'commandcode');
  const discoveredModels = normalizeModels(config.discoveredModels);
  const discoveredIds = new Set(discoveredModels.map(model => model.rawId));
  const configuredVisibleModels = normalizeStringList(config.visibleModels)
    .filter(modelId => discoveredIds.has(modelId));

  return {
    cliPath: readString(config.cliPath),
    cliPathsByHost: normalizeCliPaths(config.cliPathsByHost),
    discoveredModels,
    enabled: config.enabled === true,
    environmentVariables: typeof config.environmentVariables === 'string'
      ? config.environmentVariables
      : '',
    visibleModels: Array.isArray(config.visibleModels)
      ? configuredVisibleModels
      : discoveredModels.map(model => model.rawId),
  };
}

export function updateCommandCodeProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<CommandCodeProviderSettings>,
): CommandCodeProviderSettings {
  const current = getCommandCodeProviderSettings(settings);
  const discoveredModels = normalizeModels(updates.discoveredModels ?? current.discoveredModels);
  const knownIds = new Set(discoveredModels.map(model => model.rawId));
  const visibleModels = normalizeStringList(updates.visibleModels ?? current.visibleModels)
    .filter(modelId => knownIds.has(modelId));
  const next: CommandCodeProviderSettings = {
    ...current,
    ...updates,
    cliPath: readString(updates.cliPath ?? current.cliPath),
    cliPathsByHost: normalizeCliPaths(updates.cliPathsByHost ?? current.cliPathsByHost),
    discoveredModels,
    environmentVariables: typeof updates.environmentVariables === 'string'
      ? updates.environmentVariables
      : current.environmentVariables,
    visibleModels,
  };
  setProviderConfig(settings, 'commandcode', { ...next });
  return next;
}

function normalizeModels(value: unknown): CommandCodeModel[] {
  if (!Array.isArray(value)) return [];
  const models = new Map<string, CommandCodeModel>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const rawId = readString(entry.rawId);
    if (!rawId) continue;
    const description = readString(entry.description);
    const group = readString(entry.group);
    models.set(rawId, {
      ...(description ? { description } : {}),
      ...(group ? { group } : {}),
      rawId,
    });
  }
  return [...models.values()];
}

function normalizeCliPaths(value: unknown): HostnameCliPaths {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => (
        typeof entry[1] === 'string' && Boolean(entry[1].trim())
      ))
      .map(([host, cliPath]) => [host, cliPath.trim()]),
  );
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map(entry => entry.trim())
      .filter(Boolean),
  )];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
