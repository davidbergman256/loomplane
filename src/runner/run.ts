import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { constants as osConstants } from 'node:os';
import type { PacketCheck, SourceCheck, Packet, CompileInput, Receipt } from '../core/types.js';
import { checkSources, type SourceReader } from '../core/sources.js';
import { LoomplaneError } from '../core/errors.js';

export interface RunWithContextInput {
  databasePath?: string;
  serverUrl?: string;
  streamId: string;
  task?: string;
  budget?: number;
  agent?: string;
  command: string[];
  sourceRoot?: string;
  keepFiles?: boolean;
}
type Awaitable<T> = T | Promise<T>;
export interface RunnerPort extends SourceReader {
  compile(input: CompileInput): Awaitable<Packet>;
  checkPacket(id: string): Awaitable<PacketCheck>;
  startReceipt(packetId: string, agent: string): Awaitable<Receipt>;
  getReceipt(id: string): Awaitable<Receipt>;
  finishReceipt(
    id: string,
    input: { status: 'completed' | 'abandoned'; outcome?: string; gitCommit?: string },
  ): Awaitable<Receipt>;
}

export type RunWithContextStatus =
  | 'completed-fresh'
  | 'preflight-failed'
  | 'command-failed'
  | 'command-signaled'
  | 'spawn-failed'
  | 'context-changed';

export interface RunWithContextResult {
  /** Runner exit code. A nonzero child code is preserved; stale context uses 2. */
  exitCode: number;
  /** A zero child exit plus fresh packet/source checks, not proof of context use or review. */
  status: RunWithContextStatus;
  packetId: string;
  receiptId: string | null;
  commandExitCode: number | null;
  signal: NodeJS.Signals | null;
  preflight: PacketCheck;
  postflight?: PacketCheck;
  sourcePreflight?: SourceCheck;
  sourcePostflight?: SourceCheck;
  /** Present only when keepFiles is true. */
  contextFile?: string;
  /** Present only when keepFiles is true. */
  packetFile?: string;
}

interface ChildResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error: Error | null;
}

const FORWARDED_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'];

function signalExitCode(signal: NodeJS.Signals | null): number {
  if (!signal) return 1;
  const number = osConstants.signals[signal];
  return typeof number === 'number' ? 128 + number : 1;
}

async function runChild(command: string[], env: NodeJS.ProcessEnv): Promise<ChildResult> {
  return await new Promise((resolveChild) => {
    let settled = false;
    const child = spawn(command[0]!, command.slice(1), {
      env,
      shell: false,
      stdio: 'inherit',
    });
    const handlers = new Map<NodeJS.Signals, () => void>();
    const cleanup = () => {
      for (const [signal, handler] of handlers) process.off(signal, handler);
    };
    const settle = (result: ChildResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveChild(result);
    };
    for (const signal of FORWARDED_SIGNALS) {
      const handler = () => {
        if (child.exitCode === null && child.signalCode === null) {
          try {
            child.kill(signal);
          } catch {
            // The child can exit between the state check and signal forwarding.
          }
        }
      };
      handlers.set(signal, handler);
      process.on(signal, handler);
    }
    child.once('error', (error) => settle({ exitCode: null, signal: null, error }));
    child.once('close', (exitCode, signal) =>
      settle({ exitCode, signal: signal as NodeJS.Signals | null, error: null }),
    );
  });
}

function keptFiles(
  keepFiles: boolean | undefined,
  contextFile: string,
  packetFile: string,
): Pick<RunWithContextResult, 'contextFile' | 'packetFile'> {
  return keepFiles ? { contextFile, packetFile } : {};
}

function outcomeFor(status: RunWithContextStatus, detail = ''): string {
  const suffix = detail ? ` ${detail}` : '';
  switch (status) {
    case 'completed-fresh':
      return `Command exited 0 and context preflight remained fresh.${suffix} This caller-reported receipt does not prove the command used the context or that its work was reviewed.`;
    case 'command-failed':
      return `Command exited nonzero.${suffix}`;
    case 'command-signaled':
      return `Command terminated by a signal.${suffix}`;
    case 'spawn-failed':
      return `Command could not be started.${suffix}`;
    case 'context-changed':
      return `Command exited 0, but packet or source context changed before completion.${suffix}`;
    case 'preflight-failed':
      return `Packet or source context failed before the command started.${suffix}`;
  }
}

/**
 * Compile exact context, register its caller-reported use, and run one explicit
 * argv command without a shell. Successful status means only exit 0 plus fresh
 * context checks; it does not attest that the command read or followed context.
 */
export async function runWithContext(
  store: RunnerPort,
  input: RunWithContextInput,
): Promise<RunWithContextResult> {
  if (!Array.isArray(input.command) || !input.command.length || !input.command[0]?.trim())
    throw new LoomplaneError('command must contain an executable', 400, 'INVALID_INPUT');
  if (Boolean(input.databasePath?.trim()) === Boolean(input.serverUrl?.trim()))
    throw new LoomplaneError('Choose exactly one databasePath or serverUrl', 400, 'INVALID_INPUT');
  const databasePath = input.databasePath ? resolve(input.databasePath) : undefined;
  let serverUrl: string | undefined;
  if (input.serverUrl) {
    const parsed = new URL(input.serverUrl);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw new LoomplaneError(
        'serverUrl must be an HTTP(S) URL without credentials, query or fragment',
      );
    serverUrl = input.serverUrl.replace(/\/+$/, '');
  }
  const packet = await store.compile({
    streamId: input.streamId,
    ...(input.task === undefined ? {} : { task: input.task }),
    ...(input.budget === undefined ? {} : { budget: input.budget }),
  });
  const preflight = await store.checkPacket(packet.id);
  const sourcePreflight = input.sourceRoot
    ? await checkSources(store, { root: input.sourceRoot, packetId: packet.id })
    : undefined;
  if (!preflight.ok || sourcePreflight?.ok === false) {
    return {
      exitCode: 2,
      status: 'preflight-failed',
      packetId: packet.id,
      receiptId: null,
      commandExitCode: null,
      signal: null,
      preflight,
      ...(sourcePreflight ? { sourcePreflight } : {}),
    };
  }

  const directory = await mkdtemp(join(tmpdir(), 'loomplane-run-'));
  const contextFile = join(directory, 'context.md');
  const packetFile = join(directory, 'packet.json');
  let receiptId: string | null = null;
  try {
    await chmod(directory, 0o700);
    await writeFile(contextFile, packet.text, { encoding: 'utf8', mode: 0o600 });
    await writeFile(packetFile, `${JSON.stringify(packet, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    const agent = input.agent?.trim() || basename(input.command[0]);
    const receipt = await store.startReceipt(packet.id, agent);
    receiptId = receipt.id;
    const childEnvironment = { ...process.env };
    if (serverUrl) delete childEnvironment.LOOMPLANE_DB;
    else {
      delete childEnvironment.LOOMPLANE_URL;
      delete childEnvironment.LOOMPLANE_API_TOKEN;
    }
    const child = await runChild(input.command, {
      ...childEnvironment,
      LOOMPLANE_CONTEXT_FILE: contextFile,
      LOOMPLANE_PACKET_FILE: packetFile,
      LOOMPLANE_PACKET_ID: packet.id,
      ...(databasePath ? { LOOMPLANE_DB: databasePath } : { LOOMPLANE_URL: serverUrl! }),
    });
    const files = keptFiles(input.keepFiles, contextFile, packetFile);

    if (child.error) {
      await store.finishReceipt(receipt.id, {
        status: 'abandoned',
        outcome: outcomeFor('spawn-failed', child.error.message),
      });
      return {
        exitCode: 1,
        status: 'spawn-failed',
        packetId: packet.id,
        receiptId: receipt.id,
        commandExitCode: null,
        signal: null,
        preflight,
        ...(sourcePreflight ? { sourcePreflight } : {}),
        ...files,
      };
    }
    if (child.signal) {
      await store.finishReceipt(receipt.id, {
        status: 'abandoned',
        outcome: outcomeFor('command-signaled', child.signal),
      });
      return {
        exitCode: signalExitCode(child.signal),
        status: 'command-signaled',
        packetId: packet.id,
        receiptId: receipt.id,
        commandExitCode: null,
        signal: child.signal,
        preflight,
        ...(sourcePreflight ? { sourcePreflight } : {}),
        ...files,
      };
    }
    if (child.exitCode !== 0) {
      await store.finishReceipt(receipt.id, {
        status: 'abandoned',
        outcome: outcomeFor('command-failed', `Exit code: ${child.exitCode ?? 1}.`),
      });
      return {
        exitCode: child.exitCode ?? 1,
        status: 'command-failed',
        packetId: packet.id,
        receiptId: receipt.id,
        commandExitCode: child.exitCode,
        signal: null,
        preflight,
        ...(sourcePreflight ? { sourcePreflight } : {}),
        ...files,
      };
    }

    const postflight = await store.checkPacket(packet.id);
    const sourcePostflight = input.sourceRoot
      ? await checkSources(store, { root: input.sourceRoot, packetId: packet.id })
      : undefined;
    if (!postflight.ok || sourcePostflight?.ok === false) {
      await store.finishReceipt(receipt.id, {
        status: 'abandoned',
        outcome: outcomeFor('context-changed'),
      });
      return {
        exitCode: 2,
        status: 'context-changed',
        packetId: packet.id,
        receiptId: receipt.id,
        commandExitCode: 0,
        signal: null,
        preflight,
        postflight,
        ...(sourcePreflight ? { sourcePreflight } : {}),
        ...(sourcePostflight ? { sourcePostflight } : {}),
        ...files,
      };
    }

    try {
      await store.finishReceipt(receipt.id, {
        status: 'completed',
        outcome: outcomeFor('completed-fresh'),
      });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'STALE_CONTEXT')
        throw error;
      await store.finishReceipt(receipt.id, {
        status: 'abandoned',
        outcome: outcomeFor('context-changed', 'Context changed during finalization.'),
      });
      return {
        exitCode: 2,
        status: 'context-changed',
        packetId: packet.id,
        receiptId: receipt.id,
        commandExitCode: 0,
        signal: null,
        preflight,
        postflight: await store.checkPacket(packet.id),
        ...(sourcePreflight ? { sourcePreflight } : {}),
        ...(sourcePostflight ? { sourcePostflight } : {}),
        ...files,
      };
    }
    return {
      exitCode: 0,
      status: 'completed-fresh',
      packetId: packet.id,
      receiptId: receipt.id,
      commandExitCode: 0,
      signal: null,
      preflight,
      postflight,
      ...(sourcePreflight ? { sourcePreflight } : {}),
      ...(sourcePostflight ? { sourcePostflight } : {}),
      ...files,
    };
  } catch (error) {
    if (receiptId) {
      try {
        if ((await store.getReceipt(receiptId)).status === 'started')
          await store.finishReceipt(receiptId, {
            status: 'abandoned',
            outcome: 'Runner failed after starting the command receipt.',
          });
      } catch {
        throw new LoomplaneError(
          `Runner failed and receipt ${receiptId} could not be finalized. Check this receipt before rerunning the command.`,
          503,
          'RUN_FINALIZATION_UNCERTAIN',
        );
      }
    }
    throw error;
  } finally {
    if (!input.keepFiles) await rm(directory, { recursive: true, force: true });
  }
}

export { remoteRunnerPort } from './remote.js';
