import type { ProviderCapabilities } from '../../core/providers/types';

export const COMMAND_CODE_PROVIDER_CAPABILITIES: Readonly<ProviderCapabilities> = Object.freeze({
  providerId: 'commandcode',
  supportsPersistentRuntime: false,
  supportsNativeHistory: false,
  supportsPlanMode: true,
  supportsRewind: false,
  supportsFork: false,
  supportsProviderCommands: false,
  supportsImageAttachments: false,
  supportsInstructionMode: true,
  supportsMcpTools: false,
  supportsSharedAgentSkills: true,
  reasoningControl: 'effort',
});
