import { buildCommandCodeArgs } from '@/providers/commandcode/runtime/CommandCodeChatRuntime';

describe('buildCommandCodeArgs', () => {
  it('builds safe headless resume arguments', () => {
    expect(buildCommandCodeArgs({
      effort: 'high',
      model: 'commandcode/deepseek/deepseek-v4-pro',
      permissionMode: 'plan',
      sessionId: 'session-1',
    })).toEqual([
      '--print',
      '--output-format',
      'json',
      '--skip-onboarding',
      '--no-auto-update',
      '--resume',
      'session-1',
      '--model',
      'deepseek/deepseek-v4-pro',
      '--effort',
      'high',
      '--permission-mode',
      'plan',
    ]);
  });
});
