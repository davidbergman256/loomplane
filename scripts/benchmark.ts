/**
 * Opt-in sequential baseline for the already-built core. No network or real data.
 * Run: npm run build && node scripts/benchmark.ts
 * Options: --case small|medium|all --samples 1..5 --output report.json --built-core PATH
 * Each scenario runs in a killable child process with bounded wall time.
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir, platform, arch, cpus, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
// Type-only imports keep a clean checkout typecheckable; runtime imports use the frozen build.
import type { Store as StoreType } from '../src/core/store.js';
import type { Capsule, Packet, Stream } from '../src/core/types.js';

const cases = {
  small: { capsules: 100, streams: 10 },
  medium: { capsules: 500, streams: 30 },
} as const;
type CaseName = keyof typeof cases;
type Operation = 'compile' | 'packetCheck' | 'snapshot' | 'workspace' | 'impact' | 'export';
interface Sample {
  operationMs: number;
  serializationMs: number;
  jsonBytes: number;
}
interface Message {
  type: 'begin' | 'setup' | 'sample' | 'complete' | 'error';
  phase?: string;
  data?: unknown;
  operation?: Operation;
  sample?: Sample;
  message?: string;
}
interface OperationResult {
  samples: Sample[];
  operationMs: { min: number; median: number; max: number };
  serializationMs: { min: number; median: number; max: number };
  jsonBytes: { min: number; max: number };
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rounded = (value: number) => Number(value.toFixed(3));
const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
function emit(message: Message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
function range(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    min: rounded(sorted[0]),
    median: rounded(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2),
    max: rounded(sorted.at(-1)!),
  };
}
function digestRuntime(directory: string) {
  const hash = createHash('sha256');
  for (const file of readdirSync(directory)
    .filter((f) => f.endsWith('.js'))
    .sort()) {
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(join(directory, file)));
  }
  return hash.digest('hex');
}
function databaseBytes(path: string) {
  return Object.fromEntries(
    ['', '-wal', '-shm'].map((suffix) => [
      suffix || 'database',
      existsSync(path + suffix) ? statSync(path + suffix).size : 0,
    ]),
  );
}

function fixture(store: StoreType, name: CaseName) {
  const shape = cases[name];
  const project = store.createProject({
    name: `Synthetic baseline ${name}`,
    description: 'Generated synthetic benchmark fixture; never imported from real work.',
  });
  const streams: Stream[] = [];
  const capsules: Capsule[] = [];
  let dependencyEdges = 0;
  let mountCount = 0;
  for (let i = 0; i < shape.streams; i++)
    streams.push(
      store.createStream({
        projectId: project.id,
        name: `Synthetic stream ${i}`,
        agent: `fixture-agent-${i}`,
        branch: `benchmark/stream-${i}`,
        color: '#7270b5',
      }),
    );
  const body =
    'Synthetic context: preserve the revision boundary, record the source, and review downstream assumptions when a contract changes. '.repeat(
      3,
    );
  for (let i = 0; i < shape.capsules; i++) {
    const position = i % 10;
    const dependencies =
      position === 1 || position === 2 ? [{ capsuleId: capsules[i - 1].id, version: 1 }] : [];
    dependencyEdges += dependencies.length;
    capsules.push(
      store.publishCapsule({
        projectId: project.id,
        streamId:
          position === 0 ? null : streams[Math.floor((i * streams.length) / shape.capsules)].id,
        kind: position === 0 ? 'decision' : position === 2 ? 'artifact' : 'fact',
        key: `synthetic.baseline.${i}`,
        title: `Synthetic capsule ${String(i).padStart(4, '0')}`,
        body: `Fixture item ${i}. ${body}`,
        author: 'synthetic-benchmark',
        tags: ['synthetic', 'baseline', name],
        priority: 50,
        evidence: [
          {
            label: 'Synthetic source',
            uri: `repo://synthetic-baseline/context/${i}.md`,
            excerpt: 'Artificial evidence for a bounded local measurement; no user content.',
          },
        ],
        dependencies,
      }),
    );
  }
  // Every stream directly follows the revised root and also follows a depth-two claim.
  // Fill to eight distinct live mounts per stream, excluding capsules owned there.
  for (let i = 0; i < streams.length; i++) {
    const selected = new Set<number>();
    for (const index of [
      0,
      2,
      ...Array.from({ length: shape.capsules }, (_, j) => (i * 7 + j * 11) % shape.capsules),
    ]) {
      if (selected.size === 8) break;
      if (capsules[index].streamId === streams[i].id) continue;
      selected.add(index);
    }
    if (selected.size !== 8)
      throw new Error('Fixture failed to produce eight distinct external mounts.');
    for (const index of selected) {
      store.mount({ streamId: streams[i].id, capsuleId: capsules[index].id, mode: 'live' });
      mountCount++;
    }
  }
  const packets = streams.map((stream) =>
    store.compile({
      streamId: stream.id,
      task: 'Synthetic baseline: implement the current scoped task.',
      budget: 8000,
    }),
  );
  if (packets.some((packet) => packet.omitted.length))
    throw new Error('Fixture unexpectedly exceeded the context budget.');
  const receipts = packets.slice(0, Math.min(3, packets.length)).map((packet) => {
    const receipt = store.startReceipt(packet.id, 'synthetic-benchmark');
    return store.finishReceipt(receipt.id, {
      status: 'completed',
      outcome: 'Synthetic baseline setup completed before the source revision.',
    });
  });
  store.reviseCapsule(capsules[0].id, {
    expectedVersion: 1,
    body: `${capsules[0].body}\nSynthetic revision two: downstream claims require an explicit review.`,
    changeNote: 'Artificial revision to exercise direct and transitive invalidation.',
    author: 'synthetic-benchmark',
  });
  return {
    project,
    streams,
    capsules,
    packets,
    receipts,
    shape: {
      projects: 1,
      ...shape,
      sharedCapsules: capsules.filter((c) => c.streamId === null).length,
      dependencyEdges,
      maxDependencyDepth: 2,
      mounts: mountCount,
      liveMountsPerStream: 8,
      initialPackets: packets.length,
      receipts: receipts.length,
      revisions: shape.capsules + 1,
      changedRoots: 1,
      changedRootDerivedDescendants: 2,
      bodyUtf8Bytes: range(capsules.map((c) => Buffer.byteLength(c.body))),
      evidencePerCapsule: 1,
      tagsPerCapsule: 3,
      budget: 8000,
    },
  };
}

async function worker() {
  const [runtime, workdir, name, sampleText] = process.argv.slice(3);
  if (!(name in cases)) throw new Error('Unknown scenario.');
  const Store = (await import(pathToFileURL(join(runtime, 'index.js')).href)).Store as {
    new (path: string): StoreType;
  };
  const path = join(workdir, 'benchmark.sqlite');
  let store: StoreType | undefined;
  try {
    emit({ type: 'begin', phase: 'fixture' });
    const setupStart = performance.now();
    store = new Store(path);
    const data = fixture(store, name as CaseName);
    const setupMs = performance.now() - setupStart;
    emit({ type: 'setup', data: { ...data.shape, setupMs: rounded(setupMs) } });
    const operations: [Operation, () => unknown][] = [
      [
        'compile',
        () =>
          store!.compile({
            streamId: data.streams[0].id,
            task: 'Synthetic baseline: implement the current scoped task.',
            budget: 8000,
          }),
      ],
      ['packetCheck', () => store!.checkPacket(data.packets[0].id)],
      ['snapshot', () => store!.snapshot(data.project.id)],
      ['impact', () => store!.impact(data.capsules[0].id)],
      ['export', () => store!.exportProject(data.project.id)],
    ];
    if (typeof store.workspaceSnapshot === 'function')
      operations.splice(3, 0, ['workspace', () => store!.workspaceSnapshot(data.project.id)]);
    const summaries: Record<string, unknown> = {};
    let readVersion = 0;
    for (const [operation, run] of operations) {
      if (operation === 'packetCheck') readVersion = store.getChangeVersion();
      for (let i = 0; i < Number(sampleText); i++) {
        emit({ type: 'begin', phase: `${operation} sample ${i + 1}` });
        const start = performance.now();
        const result = run();
        const operationMs = performance.now() - start;
        const serializationStart = performance.now();
        const json = JSON.stringify(result);
        const serializationMs = performance.now() - serializationStart;
        const jsonBytes = Buffer.byteLength(json);
        emit({
          type: 'sample',
          operation,
          sample: {
            operationMs: rounded(operationMs),
            serializationMs: rounded(serializationMs),
            jsonBytes,
          },
        });
        if (i === 0) {
          if (operation === 'compile') {
            const packet = result as Packet;
            summaries.compile = {
              manifestItems: packet.manifest.length,
              omitted: packet.omitted.length,
              estimatedTokens: packet.estimatedTokens,
              packetTextBytes: Buffer.byteLength(packet.text),
            };
          }
          if (operation === 'packetCheck') {
            const check = result as ReturnType<StoreType['checkPacket']>;
            summaries.packetCheck = {
              ok: check.ok,
              drift: check.drift.length,
              dependencyDrift: check.drift.filter((d) => d.reason === 'dependency').length,
              conflicts: check.conflicts.length,
            };
            if (check.ok || !check.drift.some((d) => d.reason === 'dependency'))
              throw new Error('Fixture did not produce both stale context and dependency drift.');
          }
          if (operation === 'snapshot') {
            const snapshot = result as ReturnType<StoreType['snapshot']>;
            summaries.snapshot = { ...snapshot.stats, eventsReturned: snapshot.events.length };
          }
          if (operation === 'workspace') {
            const workspace = result as ReturnType<StoreType['workspaceSnapshot']>;
            summaries.workspace = {
              ...workspace.stats,
              eventsReturned: workspace.events.length,
              format: workspace.format,
              version: workspace.version,
            };
          }
          if (operation === 'impact') {
            const impact = result as ReturnType<StoreType['impact']>;
            summaries.impact = {
              dependentCapsules: impact.dependentCapsules.length,
              streams: impact.streams.length,
              receipts: impact.receipts.length,
            };
          }
          if (operation === 'export') {
            const exported = result as Record<string, unknown>;
            summaries.export = Object.fromEntries(
              Object.entries(exported)
                .filter(([, value]) => Array.isArray(value))
                .map(([key, value]) => [key, (value as unknown[]).length]),
            );
          }
        }
      }
    }
    const readOperationsDidNotMutate = store.getChangeVersion() === readVersion;
    if (!readOperationsDidNotMutate)
      throw new Error('A read operation unexpectedly changed the audit log.');
    const storageBeforeClose = databaseBytes(path);
    store.close();
    store = undefined;
    emit({
      type: 'complete',
      data: {
        summaries,
        readOperationsDidNotMutate,
        storageBeforeClose,
        storageAfterClose: databaseBytes(path),
      },
    });
  } finally {
    store?.close();
  }
}

async function scenario(runtime: string, workdir: string, name: CaseName, samples: number) {
  const measurements: Partial<Record<Operation, Sample[]>> = {};
  let setup: unknown;
  let details: unknown;
  let phase = 'worker startup';
  let buffer = '';
  let failure: string | undefined;
  let completed = false;
  const started = performance.now();
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), '--worker', runtime, workdir, name, String(samples)],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let phaseTimer: ReturnType<typeof setTimeout>;
  const terminate = (reason: string) => {
    failure = reason;
    child.kill('SIGKILL');
  };
  const arm = () => {
    clearTimeout(phaseTimer);
    phaseTimer = setTimeout(
      () => terminate(`Stopped after 10 seconds without progress during ${phase}.`),
      10000,
    );
  };
  arm();
  const totalTimer = setTimeout(
    () => terminate(`Stopped at the 30-second scenario wall-time limit during ${phase}.`),
    30000,
  );
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line) as Message;
        if (message.type === 'begin') {
          phase = message.phase!;
          arm();
        }
        if (message.type === 'setup') setup = message.data;
        if (message.type === 'sample' && message.operation && message.sample)
          (measurements[message.operation] ??= []).push(message.sample);
        if (message.type === 'complete') {
          details = message.data;
          completed = true;
        }
        if (message.type === 'error') failure = message.message;
      } catch {
        failure = 'Worker emitted an invalid progress record.';
      }
    }
  });
  // SQLite's experimental warning and native stack paths are deliberately not copied into the report.
  child.stderr.resume();
  const code = await new Promise<number | null>((resolveExit) => {
    child.once('error', (cause) => {
      failure = errorMessage(cause);
      resolveExit(null);
    });
    child.once('close', resolveExit);
  });
  clearTimeout(phaseTimer!);
  clearTimeout(totalTimer);
  const operations: Partial<Record<Operation, OperationResult>> = {};
  for (const [operation, values] of Object.entries(measurements) as [Operation, Sample[]][]) {
    operations[operation] = {
      samples: values,
      operationMs: range(values.map((s) => s.operationMs)),
      serializationMs: range(values.map((s) => s.serializationMs)),
      jsonBytes: {
        min: Math.min(...values.map((s) => s.jsonBytes)),
        max: Math.max(...values.map((s) => s.jsonBytes)),
      },
    };
  }
  return {
    name,
    status: completed && code === 0 && !failure ? 'complete' : 'incomplete',
    wallMs: rounded(performance.now() - started),
    setup,
    operations,
    ...((details as object) ?? {}),
    ...(failure
      ? {
          error: failure
            .replaceAll(root, '<repository>')
            .replaceAll(dirname(workdir), '<temporary baseline>'),
        }
      : !completed
        ? { error: `Worker exited before completion (exit code ${code}).` }
        : {}),
  };
}

async function main() {
  const args = process.argv.slice(2);
  let selected = 'all';
  let samples = 3;
  let output: string | undefined;
  let builtOverride: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--case') selected = args[++i];
    else if (args[i] === '--samples') samples = Number(args[++i]);
    else if (args[i] === '--output') output = args[++i];
    else if (args[i] === '--built-core') builtOverride = args[++i];
    else throw new Error(`Unknown option: ${args[i]}`);
  }
  if (
    !['small', 'medium', 'all'].includes(selected) ||
    !Number.isInteger(samples) ||
    samples < 1 ||
    samples > 5
  )
    throw new Error('Use --case small|medium|all and --samples 1..5.');
  const built = builtOverride ? resolve(builtOverride) : join(root, 'dist/core');
  if (!existsSync(join(built, 'index.js')))
    throw new Error('Build the project first: npm run build');
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'loomplane-baseline-')));
  const runtime = join(temporary, 'runtime');
  try {
    symlinkSync(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');
    const hash = digestRuntime(built);
    cpSync(built, runtime, { recursive: true });
    if (hash !== digestRuntime(built) || hash !== digestRuntime(runtime))
      throw new Error(
        'The built runtime changed while it was being frozen. Rerun after the build finishes.',
      );
    const results = [];
    for (const name of (selected === 'all' ? ['small', 'medium'] : [selected]) as CaseName[]) {
      const workdir = join(temporary, name);
      const { mkdirSync } = await import('node:fs');
      mkdirSync(workdir);
      results.push(await scenario(runtime, workdir, name, samples));
    }
    const report = {
      schemaVersion: 1,
      measuredAt: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: platform(),
        architecture: arch(),
        cpuModel: cpus()[0]?.model ?? 'unavailable',
        logicalCpuCount: cpus().length,
        totalMemoryMiB: Math.round(totalmem() / 1024 / 1024),
      },
      runtime: {
        target: 'prebuilt core directory, frozen into a temporary copy before measurement',
        sha256: hash,
      },
      method: {
        samplesPerOperation: samples,
        operationsSequential: true,
        discardedWarmups: 0,
        operationTimeExcludesJsonSerialization: true,
        serializationTimeExcludesByteCount: true,
        phaseTimeoutMs: 10000,
        scenarioTimeoutMs: 30000,
        storage: 'isolated temporary on-disk SQLite; cleaned after completion',
        claims:
          'A bounded local baseline only; not concurrent load, HTTP latency, throughput, production capacity, or enterprise readiness.',
      },
      results,
    };
    const text = JSON.stringify(report, null, 2) + '\n';
    if (output) writeFileSync(resolve(output), text);
    else process.stdout.write(text);
    if (results.some((r) => r.status !== 'complete')) process.exitCode = 1;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
if (process.argv[2] === '--worker')
  worker().catch((cause) => {
    emit({ type: 'error', message: errorMessage(cause) });
    process.exitCode = 1;
  });
else
  main().catch((cause) => {
    process.stderr.write(`${errorMessage(cause).replaceAll(root, '<repository>')}\n`);
    process.exitCode = 1;
  });
