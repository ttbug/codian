import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type {
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import { NativeAcpCliResolver } from '../../native-acp/runtime/NativeAcpCliResolver';
import { CommandCodeModelDiscoveryService } from '../runtime/CommandCodeModelDiscoveryService';
import { commandCodeSettingsTabRenderer } from '../ui/CommandCodeSettingsTab';

export interface CommandCodeWorkspaceServices extends ProviderWorkspaceServices {
  discoverModels(): ReturnType<CommandCodeModelDiscoveryService['discoverModels']>;
}

export const commandCodeWorkspaceRegistration: ProviderWorkspaceRegistration<CommandCodeWorkspaceServices> = {
  async initialize({ plugin }): Promise<CommandCodeWorkspaceServices> {
    const cliResolver = new NativeAcpCliResolver('commandcode', 'cmd');
    return {
      cliResolver,
      discoverModels: () => new CommandCodeModelDiscoveryService(plugin).discoverModels(),
      settingsTabRenderer: commandCodeSettingsTabRenderer,
      tabWarmupPolicy: { resolveMode: () => 'none' },
    };
  },
};

export function maybeGetCommandCodeWorkspaceServices(): CommandCodeWorkspaceServices | null {
  return ProviderWorkspaceRegistry.getServices('commandcode') as CommandCodeWorkspaceServices | null;
}
