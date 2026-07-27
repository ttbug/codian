import { type ChildProcessWithoutNullStreams,spawn } from 'node:child_process';
import * as path from 'node:path';
import { createInterface } from 'node:readline';

import { toProviderRuntimeModelId } from '../../../core/providers/modelSelection';
import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import type { ProviderHost } from '../../../core/providers/ProviderHost';
import type { ProviderCapabilities } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type {
  ApprovalCallback,
  AskUserQuestionCallback,
  AutoTurnCallback,
  ChatRewindMode,
  ChatRewindResult,
  ChatRuntimeConversationState,
  ChatRuntimeEnsureReadyOptions,
  ChatRuntimeQueryOptions,
  ChatTurnMetadata,
  ChatTurnRequest,
  ExitPlanModeCallback,
  PreparedChatTurn,
  SessionUpdateResult,
} from '../../../core/runtime/types';
import type {
  ChatMessage,
  Conversation,
  SlashCommand,
  StreamChunk,
} from '../../../core/types';
import { appendBrowserContext } from '../../../utils/browser';
import { appendCanvasContext } from '../../../utils/canvas';
import { appendCurrentNote } from '../../../utils/context';
import { appendEditorContext } from '../../../utils/editor';
import { getEnhancedPath, parseEnvironmentVariables } from '../../../utils/env';
import { getVaultPath } from '../../../utils/path';
import {
  resolveWindowsCmdShimSpawnSpec,
  terminateSpawnedProcess,
  type WindowsCmdShimSpawnSpec,
} from '../../../utils/windowsCmdShim';
import { COMMAND_CODE_PROVIDER_CAPABILITIES } from '../capabilities';
import {
  createCommandCodeEventState,
  normalizeCommandCodeRecord,
} from './CommandCodeEventNormalizer';

const STDERR_LIMIT = 8_000;

interface ActiveTurn {
  cancelled: boolean;
  killTimer: number | null;
  process: ChildProcessWithoutNullStreams;
  queue: StreamChunkQueue;
  spawnSpec: WindowsCmdShimSpawnSpec;
}

export interface CommandCodeChatRuntimeOptions {
  noSession?: boolean;
  permissionMode?: string;
}

export class CommandCodeChatRuntime implements ChatRuntime {
  readonly providerId = 'commandcode' as const;

  private activeTurn: ActiveTurn | null = null;
  private disposed = false;
  private ready = false;
  private readonly readyListeners = new Set<(ready: boolean) => void>();
  private sessionId: string | null = null;
  private sessionInvalidated = false;

  constructor(
    private readonly plugin: ProviderHost,
    private readonly options: CommandCodeChatRuntimeOptions = {},
  ) {}

  getCapabilities(): Readonly<ProviderCapabilities> {
    return COMMAND_CODE_PROVIDER_CAPABILITIES;
  }

  prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
    let prompt = request.text;
    if (request.currentNotePath) prompt = appendCurrentNote(prompt, request.currentNotePath);
    if (request.editorSelection && request.editorSelection.mode !== 'none') {
      prompt = appendEditorContext(prompt, request.editorSelection);
    }
    if (request.browserSelection) prompt = appendBrowserContext(prompt, request.browserSelection);
    if (request.canvasSelection) prompt = appendCanvasContext(prompt, request.canvasSelection);
    return {
      isCompact: false,
      mcpMentions: new Set(),
      persistedContent: request.text,
      prompt,
      request,
    };
  }

  onReadyStateChange(listener: (ready: boolean) => void): () => void {
    this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }

  setResumeCheckpoint(_checkpointId: string | undefined): void {}

  syncConversationState(conversation: ChatRuntimeConversationState | null): void {
    this.sessionId = conversation?.sessionId ?? null;
    this.sessionInvalidated = false;
  }

  async reloadMcpServers(): Promise<void> {}

  async ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    if (this.disposed) return false;
    const command = await this.plugin.getResolvedProviderCliPath('commandcode');
    this.setReady(Boolean(command));
    return this.ready;
  }

  async *query(
    turn: PreparedChatTurn,
    _conversationHistory?: ChatMessage[],
    queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk> {
    if (this.activeTurn) {
      yield { type: 'error', content: 'Command Code does not support overlapping turns.' };
      yield { type: 'done' };
      return;
    }
    if (!(await this.ensureReady())) {
      yield {
        type: 'error',
        content: 'Command Code CLI was not found. Check the provider CLI path.',
      };
      yield { type: 'done' };
      return;
    }

    const command = await this.plugin.getResolvedProviderCliPath('commandcode') ?? 'cmd';
    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const envVars = parseEnvironmentVariables(
      getRuntimeEnvironmentText(this.plugin.settings, 'commandcode'),
    );
    const args = buildCommandCodeArgs({
      effort: readString(this.plugin.settings.effortLevel),
      model: queryOptions?.model,
      noSession: this.options.noSession,
      permissionMode: this.options.permissionMode
        ?? readString(this.plugin.settings.permissionMode),
      sessionId: this.options.noSession ? null : this.sessionId,
    });
    const spawnSpec = resolveWindowsCmdShimSpawnSpec({ args, command });
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd,
      env: {
        ...process.env,
        ...envVars,
        PATH: getEnhancedPath(
          envVars.PATH,
          path.isAbsolute(command) ? command : undefined,
        ),
      },
      stdio: 'pipe',
      windowsHide: true,
      ...(spawnSpec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    });
    const activeTurn: ActiveTurn = {
      cancelled: false,
      killTimer: null,
      process: child,
      queue: new StreamChunkQueue(),
      spawnSpec,
    };
    this.activeTurn = activeTurn;
    this.consumeProcess(activeTurn);
    child.stdin.end(turn.prompt);

    try {
      while (true) {
        const chunk = await activeTurn.queue.next();
        if (!chunk) break;
        yield chunk;
      }
    } finally {
      if (this.activeTurn === activeTurn) this.activeTurn = null;
    }
  }

  cancel(): void {
    const activeTurn = this.activeTurn;
    if (!activeTurn || activeTurn.cancelled) return;
    activeTurn.cancelled = true;
    terminateSpawnedProcess(activeTurn.process, 'SIGTERM', spawn, activeTurn.spawnSpec);
    activeTurn.killTimer = window.setTimeout(() => {
      terminateSpawnedProcess(activeTurn.process, 'SIGKILL', spawn, activeTurn.spawnSpec);
    }, 3_000);
  }

  resetSession(): void {
    this.sessionId = null;
    this.sessionInvalidated = true;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  consumeSessionInvalidation(): boolean {
    const invalidated = this.sessionInvalidated;
    this.sessionInvalidated = false;
    return invalidated;
  }

  isReady(): boolean {
    return this.ready;
  }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    return [];
  }

  cleanup(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.setReady(false);
  }

  async rewind(
    _userMessageId: string,
    _assistantMessageId: string | undefined,
    _mode?: ChatRewindMode,
  ): Promise<ChatRewindResult> {
    return { canRewind: false };
  }

  setApprovalCallback(_callback: ApprovalCallback | null): void {}
  setApprovalDismisser(_dismisser: (() => void) | null): void {}
  setAskUserQuestionCallback(_callback: AskUserQuestionCallback | null): void {}
  setExitPlanModeCallback(_callback: ExitPlanModeCallback | null): void {}
  setPermissionModeSyncCallback(_callback: ((sdkMode: string) => void) | null): void {}
  setAutoTurnCallback(_callback: AutoTurnCallback | null): void {}

  consumeTurnMetadata(): ChatTurnMetadata {
    return {};
  }

  buildSessionUpdates(params: {
    conversation: Conversation | null;
    sessionInvalidated: boolean;
  }): SessionUpdateResult {
    return {
      updates: {
        sessionId: params.sessionInvalidated ? null : this.sessionId,
      },
    };
  }

  resolveSessionIdForFork(conversation: Conversation | null): string | null {
    return this.sessionId ?? conversation?.sessionId ?? null;
  }

  private consumeProcess(activeTurn: ActiveTurn): void {
    const state = createCommandCodeEventState();
    const lines = createInterface({ input: activeTurn.process.stdout });
    let stderr = '';
    let receivedResult = false;

    activeTurn.process.stderr.on('data', (chunk: Buffer | string) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-STDERR_LIMIT);
    });
    lines.on('line', (line) => {
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        return;
      }
      if (!isRecord(record)) return;
      const normalized = normalizeCommandCodeRecord(record, state);
      for (const chunk of normalized.chunks) activeTurn.queue.push(chunk);
      if (!normalized.result) return;

      receivedResult = true;
      if (normalized.result.sessionId && !this.options.noSession) {
        this.sessionId = normalized.result.sessionId;
      }
      if (normalized.result.usage) {
        activeTurn.queue.push({
          type: 'usage',
          usage: normalized.result.usage,
          sessionId: normalized.result.sessionId,
        });
      }
      if (normalized.result.error) {
        activeTurn.queue.push({ type: 'error', content: normalized.result.error });
      }
    });
    activeTurn.process.once('error', (error) => {
      activeTurn.queue.push({ type: 'error', content: error.message });
    });
    activeTurn.process.once('close', (code) => {
      if (activeTurn.killTimer) window.clearTimeout(activeTurn.killTimer);
      lines.close();
      if (!activeTurn.cancelled && !receivedResult && code !== 0) {
        activeTurn.queue.push({
          type: 'error',
          content: stderr.trim() || `Command Code exited with code ${code}.`,
        });
      }
      activeTurn.queue.push({ type: 'done' });
      activeTurn.queue.close();
    });
  }

  private setReady(ready: boolean): void {
    if (this.ready === ready) return;
    this.ready = ready;
    for (const listener of this.readyListeners) listener(ready);
  }
}

export function buildCommandCodeArgs(options: {
  effort?: string;
  model?: string;
  noSession?: boolean;
  permissionMode?: string;
  sessionId?: string | null;
}): string[] {
  const args = [
    '--print',
    '--output-format',
    'json',
    '--skip-onboarding',
    '--no-auto-update',
  ];
  if (options.noSession) {
    args.push('--no-session');
  } else if (options.sessionId) {
    args.push('--resume', options.sessionId);
  }
  if (options.model) {
    args.push('--model', toProviderRuntimeModelId('commandcode', options.model));
  }
  if (options.effort && options.effort !== 'off') {
    args.push('--effort', options.effort);
  }
  if (options.permissionMode === 'plan') {
    args.push('--permission-mode', 'plan');
  } else if (options.permissionMode === 'yolo') {
    args.push('--yolo');
  }
  return args;
}

class StreamChunkQueue {
  private closed = false;
  private readonly items: StreamChunk[] = [];
  private readonly waiters: Array<(chunk: StreamChunk | null) => void> = [];

  push(chunk: StreamChunk): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter(chunk);
    else this.items.push(chunk);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.waiters.length > 0) this.waiters.shift()?.(null);
  }

  async next(): Promise<StreamChunk | null> {
    if (this.items.length > 0) return this.items.shift() ?? null;
    if (this.closed) return null;
    return new Promise(resolve => this.waiters.push(resolve));
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
