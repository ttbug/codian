import type { StreamChunk, UsageInfo } from '../../../core/types';

export interface CommandCodeEventState {
  emittedToolIds: Set<string>;
}

export interface CommandCodeResult {
  error: string | null;
  sessionId: string | null;
  usage: UsageInfo | null;
}

export function createCommandCodeEventState(): CommandCodeEventState {
  return { emittedToolIds: new Set<string>() };
}

export function normalizeCommandCodeRecord(
  record: Record<string, unknown>,
  state: CommandCodeEventState,
  contextWindow = 200_000,
): { chunks: StreamChunk[]; result: CommandCodeResult | null } {
  if (record.type === 'result') {
    const sessionId = readString(record.sessionId);
    const subtype = readString(record.subtype);
    const error = subtype === 'error'
      ? readError(record.error) || 'Command Code failed.'
      : null;
    return {
      chunks: [],
      result: {
        error,
        sessionId,
        usage: buildUsage(record.usage, contextWindow),
      },
    };
  }

  if (record.type !== 'event' || !isRecord(record.event)) {
    return { chunks: [], result: null };
  }

  const event = record.event;
  switch (event.type) {
    case 'text_delta': {
      const content = readString(event.delta) || readString(event.text);
      return chunk(content ? { type: 'text', content } : null);
    }
    case 'thinking_delta': {
      const content = readString(event.delta) || readString(event.text);
      return chunk(content ? { type: 'thinking', content } : null);
    }
    case 'tool_queued':
    case 'tool_running': {
      const id = readString(event.toolCallId) || readString(event.id);
      if (!id || state.emittedToolIds.has(id)) return { chunks: [], result: null };
      state.emittedToolIds.add(id);
      return chunk({
        type: 'tool_use',
        id,
        name: readString(event.toolName) || 'tool',
        input: isRecord(event.input) ? event.input : {},
      });
    }
    case 'tool_update': {
      const id = readString(event.toolCallId) || readString(event.id);
      const content = readContent(event.partial);
      return chunk(id && content ? { type: 'tool_output', id, content } : null);
    }
    case 'tool_completed':
    case 'tool_errored':
    case 'tool_denied':
    case 'tool_hook_blocked': {
      const id = readString(event.toolCallId) || readString(event.id);
      const content = readContent(
        event.result ?? event.error ?? event.hookOutput ?? 'Tool execution was denied.',
      );
      return chunk(id ? {
        type: 'tool_result',
        id,
        content,
        isError: event.type !== 'tool_completed',
      } : null);
    }
    case 'compaction_done':
      return chunk({ type: 'context_compacted' });
    case 'notice': {
      const content = readString(event.message);
      return chunk(content ? {
        type: 'notice',
        content,
        level: event.level === 'warning' ? 'warning' : 'info',
      } : null);
    }
    case 'api_retry': {
      const message = readError(event.error) || 'Command Code is retrying the request.';
      return chunk({ type: 'notice', content: message, level: 'warning' });
    }
    case 'run_error':
      return chunk({ type: 'error', content: readError(event.error) || 'Command Code failed.' });
    default:
      return { chunks: [], result: null };
  }
}

function chunk(value: StreamChunk | null): { chunks: StreamChunk[]; result: null } {
  return { chunks: value ? [value] : [], result: null };
}

function buildUsage(value: unknown, contextWindow: number): UsageInfo | null {
  if (!isRecord(value)) return null;
  const inputTokens = readNumber(value.inputTokens)
    ?? readNumber(value.input_tokens)
    ?? readNumber(value.promptTokens)
    ?? readNumber(value.prompt_tokens);
  if (inputTokens === null) return null;
  return {
    contextTokens: inputTokens,
    contextWindow,
    inputTokens,
    percentage: contextWindow > 0
      ? Math.min(100, Math.max(0, Math.round((inputTokens / contextWindow) * 100)))
      : 0,
  };
}

function readContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(readContent).filter(Boolean).join('\n');
  }
  if (isRecord(value)) {
    return readString(value.text)
      || readString(value.content)
      || readString(value.message)
      || JSON.stringify(value);
  }
  return value == null ? '' : String(value);
}

function readError(value: unknown): string {
  return isRecord(value)
    ? readString(value.message) || readContent(value)
    : readContent(value);
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
