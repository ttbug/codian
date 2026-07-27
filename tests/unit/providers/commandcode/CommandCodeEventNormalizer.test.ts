import {
  createCommandCodeEventState,
  normalizeCommandCodeRecord,
} from '@/providers/commandcode/runtime/CommandCodeEventNormalizer';

describe('normalizeCommandCodeRecord', () => {
  it('normalizes streaming text, tools, and the final session result', () => {
    const state = createCommandCodeEventState();

    expect(normalizeCommandCodeRecord({
      type: 'event',
      event: { type: 'text_delta', delta: 'hello' },
    }, state).chunks).toEqual([{ type: 'text', content: 'hello' }]);

    expect(normalizeCommandCodeRecord({
      type: 'event',
      event: {
        type: 'tool_queued',
        toolCallId: 'tool-1',
        toolName: 'read_file',
        input: { path: 'README.md' },
      },
    }, state).chunks).toEqual([{
      type: 'tool_use',
      id: 'tool-1',
      name: 'read_file',
      input: { path: 'README.md' },
    }]);

    expect(normalizeCommandCodeRecord({
      type: 'result',
      subtype: 'success',
      sessionId: 'session-1',
      usage: { inputTokens: 1_000 },
    }, state, 10_000).result).toEqual({
      error: null,
      sessionId: 'session-1',
      usage: {
        contextTokens: 1_000,
        contextWindow: 10_000,
        inputTokens: 1_000,
        percentage: 10,
      },
    });
  });
});
