import { QueryBackedInlineEditService } from '../../core/auxiliary/QueryBackedInlineEditService';
import { QueryBackedInstructionRefineService } from '../../core/auxiliary/QueryBackedInstructionRefineService';
import { QueryBackedTitleGenerationService } from '../../core/auxiliary/QueryBackedTitleGenerationService';
import type { ProviderModule } from '../../core/providers/types';
import {
  NativeAcpConversationHistoryService,
  nativeAcpSettingsReconciler,
  NativeAcpTaskResultInterpreter,
} from '../native-acp/services';
import { commandCodeWorkspaceRegistration } from './app/CommandCodeWorkspaceServices';
import { COMMAND_CODE_PROVIDER_CAPABILITIES } from './capabilities';
import { CommandCodeAuxQueryRunner } from './runtime/CommandCodeAuxQueryRunner';
import { CommandCodeChatRuntime } from './runtime/CommandCodeChatRuntime';
import {
  getCommandCodeProviderSettings,
  updateCommandCodeProviderSettings,
} from './settings';
import { commandCodeChatUIConfig } from './ui/CommandCodeChatUIConfig';

export const commandCodeProviderRegistration: ProviderModule = {
  id: 'commandcode',
  displayOrder: 70,
  capabilities: COMMAND_CODE_PROVIDER_CAPABILITIES,
  chatUIConfig: commandCodeChatUIConfig,
  createInlineEditService: plugin => (
    new QueryBackedInlineEditService(new CommandCodeAuxQueryRunner(plugin))
  ),
  createInstructionRefineService: plugin => (
    new QueryBackedInstructionRefineService(new CommandCodeAuxQueryRunner(plugin))
  ),
  createRuntime: ({ plugin }) => new CommandCodeChatRuntime(plugin),
  createTitleGenerationService: plugin => new QueryBackedTitleGenerationService({
    createRunner: () => new CommandCodeAuxQueryRunner(plugin),
  }),
  displayName: 'Command Code',
  environmentKeyPatterns: [/^COMMANDCODE_/i, /^CMD_/i],
  historyService: new NativeAcpConversationHistoryService(),
  isEnabled: settings => getCommandCodeProviderSettings(settings).enabled,
  setEnabled: (settings, enabled) => updateCommandCodeProviderSettings(settings, { enabled }),
  settingsReconciler: nativeAcpSettingsReconciler,
  settingsStorage: {
    hostScopedFields: ['cliPathsByHost'],
    normalizeStored(target, stored) {
      updateCommandCodeProviderSettings(target, getCommandCodeProviderSettings(stored));
      return false;
    },
  },
  taskResultInterpreter: new NativeAcpTaskResultInterpreter(),
  workspace: commandCodeWorkspaceRegistration,
};
