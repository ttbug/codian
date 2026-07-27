import { parseCommandCodeModels } from '@/providers/commandcode/runtime/CommandCodeModelDiscoveryService';

describe('parseCommandCodeModels', () => {
  it('parses grouped model rows from cmd --list-models', () => {
    expect(parseCommandCodeModels(`
Available models  ·  2 models

Open Source

deepseek/deepseek-v4-pro  long-context reasoning
moonshotai/kimi-k3        long-horizon coding

Pass the full id, or just the short name:
    `)).toEqual([
      {
        description: 'long-context reasoning',
        group: 'Open Source',
        rawId: 'deepseek/deepseek-v4-pro',
      },
      {
        description: 'long-horizon coding',
        group: 'Open Source',
        rawId: 'moonshotai/kimi-k3',
      },
    ]);
  });
});
