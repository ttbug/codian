import { Notice, Setting } from 'obsidian';

import type {
  ProviderSettingsTabRenderer,
  ProviderSettingsTabRendererContext,
} from '../../../core/providers/types';
import { t } from '../../../i18n/i18n';
import {
  type ProviderModelPickerModel,
  type ProviderModelPickerState,
  renderProviderModelPicker,
} from '../../../shared/settings/ProviderModelPicker';
import { getHostnameKey } from '../../../utils/env';
import { maybeGetCommandCodeWorkspaceServices } from '../app/CommandCodeWorkspaceServices';
import {
  getCommandCodeProviderSettings,
  updateCommandCodeProviderSettings,
} from '../settings';

export const commandCodeSettingsTabRenderer: ProviderSettingsTabRenderer = {
  sections: ['provider'],
  render(container, context, section) {
    if (section !== undefined && section !== 'provider') return;

    const settingsBag = context.plugin.settings as Record<string, unknown>;
    const providerSettings = getCommandCodeProviderSettings(settingsBag);
    const hostnameKey = getHostnameKey();

    new Setting(container).setName(t('settings.setup')).setHeading();
    new Setting(container)
      .setName(t('settings.providerCliPath.name'))
      .setDesc(t('settings.providerCliPath.desc', {
        command: 'cmd',
        provider: 'Command Code',
      }))
      .addText(text => text
        .setPlaceholder(process.platform === 'win32' ? 'cmd.cmd' : '/usr/local/bin/cmd')
        .setValue(providerSettings.cliPathsByHost[hostnameKey] ?? '')
        .onChange(async (value) => {
          const cliPathsByHost = { ...providerSettings.cliPathsByHost };
          if (value.trim()) cliPathsByHost[hostnameKey] = value.trim();
          else delete cliPathsByHost[hostnameKey];
          await context.plugin.mutateSettings(settings => {
            updateCommandCodeProviderSettings(settings, {
              cliPathsByHost,
              discoveredModels: [],
              visibleModels: [],
            });
          });
          maybeGetCommandCodeWorkspaceServices()?.cliResolver?.reset();
          context.notifyProviderModelOptionsChanged('commandcode');
        }));

    new Setting(container).setName(t('settings.models')).setHeading();
    renderCommandCodeModelPicker(container, context, settingsBag);

    new Setting(container).setName(t('settings.safety')).setHeading();
    new Setting(container)
      .setName(t('settings.providerPermissions.name'))
      .setDesc('The chat toolbar maps provider access to read-only, plan, and --yolo modes.');
  },
};

function renderCommandCodeModelPicker(
  container: HTMLElement,
  context: ProviderSettingsTabRendererContext,
  settingsBag: Record<string, unknown>,
): void {
  const getState = (): ProviderModelPickerState => {
    const settings = getCommandCodeProviderSettings(settingsBag);
    return {
      aliases: {},
      discoveredCount: settings.discoveredModels.length,
      models: buildPickerModels(settings),
      selectedIds: settings.visibleModels,
    };
  };

  renderProviderModelPicker({
    container,
    emptyCatalogText: t('settings.providerCatalog.empty', { provider: 'Command Code' }),
    failedCatalogText: t('settings.providerCatalog.failed', { provider: 'Command Code' }),
    getState,
    async loadCatalog() {
      try {
        const models = await maybeGetCommandCodeWorkspaceServices()?.discoverModels() ?? [];
        const current = getCommandCodeProviderSettings(settingsBag);
        const currentVisible = new Set(current.visibleModels);
        const visibleModels = current.discoveredModels.length === 0
          ? models.map(model => model.rawId)
          : models.filter(model => currentVisible.has(model.rawId)).map(model => model.rawId);
        await context.plugin.mutateSettings(settings => {
          updateCommandCodeProviderSettings(settings, { discoveredModels: models, visibleModels });
        });
        context.notifyProviderModelOptionsChanged('commandcode');
        return models.length > 0 ? 'loaded' : 'empty';
      } catch (error) {
        new Notice(t('settings.providerCatalog.discoveryFailed', {
          message: error instanceof Error ? error.message : String(error),
          provider: 'Command Code',
        }));
        return 'failed';
      }
    },
    loadingCatalogText: t('settings.providerCatalog.loading', { provider: 'Command Code' }),
    modifier: 'commandcode',
    async onAliasesChange() {},
    async onSelectedIdsChange(visibleModels) {
      await context.plugin.mutateSettings(settings => {
        updateCommandCodeProviderSettings(settings, { visibleModels });
      });
      context.notifyProviderModelOptionsChanged('commandcode');
    },
    providerName: 'Command Code',
  });
}

function buildPickerModels(
  settings: ReturnType<typeof getCommandCodeProviderSettings>,
): ProviderModelPickerModel[] {
  return settings.discoveredModels.map(model => ({
    description: model.description,
    id: model.rawId,
    isAvailable: true,
    name: model.rawId,
    providerKey: model.group?.toLowerCase() ?? 'commandcode',
    providerLabel: model.group ?? 'Command Code',
  }));
}
