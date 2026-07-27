import {
  encodeProviderModelSelectionId,
  isProviderModelSelectionId,
} from '../../../core/providers/modelSelection';
import type {
  ProviderChatUIConfig,
  ProviderPermissionModeToggleConfig,
  ProviderUIOption,
} from '../../../core/providers/types';
import { getCommandCodeProviderSettings } from '../settings';

const DEFAULT_CONTEXT_WINDOW = 200_000;
const COMMAND_CODE_PERMISSION_TOGGLE: ProviderPermissionModeToggleConfig = {
  activeLabel: 'All tools',
  activeValue: 'yolo',
  inactiveLabel: 'Read-only',
  inactiveValue: 'normal',
  planLabel: 'Plan',
  planValue: 'plan',
};

export const commandCodeChatUIConfig: ProviderChatUIConfig = {
  modelManagement: 'visible-models',
  getModelOptions(settings): ProviderUIOption[] {
    const providerSettings = getCommandCodeProviderSettings(settings);
    const visible = new Set(providerSettings.visibleModels);
    return providerSettings.discoveredModels
      .filter(model => visible.has(model.rawId))
      .map(model => ({
        description: model.description,
        group: model.group,
        label: model.rawId,
        value: encodeProviderModelSelectionId('commandcode', model.rawId),
      }));
  },
  getDefaultModel(settings): string | null {
    const model = getCommandCodeProviderSettings(settings).visibleModels[0];
    return model ? encodeProviderModelSelectionId('commandcode', model) : null;
  },
  ownsModel(model): boolean {
    return isProviderModelSelectionId('commandcode', model);
  },
  isAdaptiveReasoningModel(): boolean {
    return true;
  },
  getReasoningOptions() {
    return [
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
    ];
  },
  getDefaultReasoningValue(): string {
    return 'medium';
  },
  getContextWindowSize(model, customLimits): number {
    return customLimits?.[model] ?? DEFAULT_CONTEXT_WINDOW;
  },
  isDefaultModel(model): boolean {
    return isProviderModelSelectionId('commandcode', model);
  },
  applyModelDefaults(model, settings): void {
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      (settings as Record<string, unknown>).model = model;
    }
  },
  normalizeModelVariant(model): string {
    return model;
  },
  getCustomModelIds(): Set<string> {
    return new Set();
  },
  getPermissionModeToggle(): ProviderPermissionModeToggleConfig {
    return COMMAND_CODE_PERMISSION_TOGGLE;
  },
  resolvePermissionMode(settings): string | null {
    return typeof settings.permissionMode === 'string' ? settings.permissionMode : 'normal';
  },
  applyPermissionMode(value, settings): void {
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      (settings as Record<string, unknown>).permissionMode = value;
    }
  },
  getModeSelector(): null {
    return null;
  },
};
