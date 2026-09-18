#!/usr/bin/env node
import { Command } from 'commander';
import { readSelection, writeSelection, selectedProject, selectedStream } from './workspace.js';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { Store, LoomplaneError } from '../core/store.js';
import { fingerprintSource, checkSources } from '../core/sources.js';
import { seedDemo } from '../core/demo.js';
import { AccessManager } from '../server/access.js';
import { startServer } from '../server/index.js';
import type { CapsuleKind, CapsuleStatus } from '../core/types.js';

const program = new Command()
  .name('loomplane')
  .description('Shared, versioned context for parallel coding agents.')
  .version('0.1.0')
  .option(
    '--db <path>',
    'SQLite database path',
    process.env.LOOMPLANE_DB ?? '.loomplane/loomplane.sqlite',
  )
  .option('--json', 'Output structured JSON (default for data commands)');
const out = (value: unknown) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const storePath = () => resolve(program.opts().db);
async function useStore(fn: (store: Store) => unknown | Promise<unknown>) {
  const store = new Store(storePath());
  try {
    const result = await fn(store);
    if (result !== undefined) out(result);
  } finally {
    store.close();
  }
}
const number = (value: string) => {
  if (!/^\d+$/.test(value)) throw new LoomplaneError('Expected a positive integer');
  return Number(value);
};

program
  .command('init')
  .description('Create a local project and a first working stream; no files are imported')
  .option('--name <name>', 'Project name', basename(process.cwd()))
  .option('--description <text>', 'Project description', '')
  .action(async (opts) =>
    useStore((store) => {
      const existing = readSelection(storePath());
      if (existing)
        return {
          project: store.getProject(existing.projectId),
          stream: store.getStream(existing.streamId),
          database: storePath(),
          alreadyInitialized: true,
        };
      const project = store.createProject(opts);
      const stream = store.createStream({
        projectId: project.id,
        name: 'Main',
        description: 'Working context for this project',
      });
      writeSelection({ database: storePath(), projectId: project.id, streamId: stream.id });
      return {
        project,
        stream,
        database: storePath(),
        next: 'loomplane remember "Your decision" --body "What the next agent needs to know"',
      };
    }),
  );
program
  .command('use <streamId>')
  .description('Select the current stream in this working directory')
  .action((streamId) =>
    useStore((store) => {
      const stream = store.getStream(streamId);
      writeSelection({ database: storePath(), projectId: stream.projectId, streamId: stream.id });
      return { project: store.getProject(stream.projectId), stream };
    }),
  );
program
  .command('where')
  .description('Show the selected local project and stream')
  .action(() =>
    useStore((store) => {
      const selected = readSelection(storePath());
      if (!selected) throw new LoomplaneError('Run loomplane init or loomplane use first.');
      return {
        project: store.getProject(selected.projectId),
        stream: store.getStream(selected.streamId),
        database: storePath(),
      };
    }),
  );
program
  .command('remember <title>')
  .description('Publish a capsule into the selected stream without copying IDs')
  .requiredOption('--body <text>', 'What future work should know')
  .option('--kind <kind>', 'Capsule kind', 'decision')
  .option('--key <key>', 'Semantic key', '')
  .option('--source <uri>', 'Evidence reference')
  .action((title, opts) =>
    useStore((store) =>
      store.publishCapsule({
        projectId: selectedProject(storePath()),
        streamId: selectedStream(storePath()),
        title,
        body: opts.body,
        kind: opts.kind,
        key: opts.key,
        evidence: opts.source ? [{ label: 'Source', uri: opts.source }] : [],
      }),
    ),
  );
program
  .command('context')
  .description('Compile context from the selected stream')
  .option('--task <text>', 'Current task', '')
  .option('--budget <tokens>', 'Estimated token budget', '4000')
  .option('--text', 'Output only the context text')
  .action((opts) =>
    useStore((store) => {
      const packet = store.compile({
        streamId: selectedStream(storePath()),
        task: opts.task,
        budget: number(opts.budget),
      });
      if (opts.text) {
        process.stdout.write(packet.text);
        return;
      }
      return packet;
    }),
  );
program
  .command('demo')
  .description('Seed the explicitly synthetic Orbit demonstration')
  .action(async () => useStore((store) => ({ ...seedDemo(store), next: 'loomplane serve' })));
program
  .command('serve')
  .description('Run the local API and web workbench')
  .option('--port <number>', 'Listen port', '4318')
  .option('--host <host>', 'Listen address', '127.0.0.1')
  .option('--dev', 'Allow local Vite development origin')
  .option('--demo', 'Seed synthetic demonstration before starting')
  .option('--auth', 'Require project-scoped API keys (or LOOMPLANE_AUTH=required)')
  .action(async (opts) => {
    const store = new Store(storePath());
    const access =
      opts.auth || process.env.LOOMPLANE_AUTH === 'required'
        ? new AccessManager(storePath())
        : undefined;
    try {
      if (opts.demo) seedDemo(store);
      const port = number(opts.port);
      if (port < 1 || port > 65535) throw new LoomplaneError('Port must be between 1 and 65535');
      const server = await startServer(store, {
        port,
        host: opts.host,
        dev: opts.dev,
        token: process.env.LOOMPLANE_TOKEN,
        access,
      });
      console.error(
        `Loomplane workbench: http://${opts.host}:${port}\nDatabase: ${storePath()}\n${access ? 'Project-scoped authentication enabled.' : process.env.LOOMPLANE_TOKEN ? 'Administrator bearer token enabled.' : ''}`,
      );
      const stop = () => {
        server.close(() => {
          access?.close();
          store.close();
          process.exit(0);
        });
        server.closeAllConnections();
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    } catch (error) {
      access?.close();
      store.close();
      throw error;
    }
  });
const accessCommands = program
  .command('access')
  .description('Manage scoped server API credentials through local database access');
accessCommands
  .command('create')
  .requiredOption('--project <id>', 'Authorized project')
  .requiredOption('--name <name>', 'Credential name')
  .option('--role <role>', 'reader or writer', 'reader')
  .action((opts) =>
    useStore((store) => {
      store.getProject(opts.project);
      const access = new AccessManager(storePath());
      try {
        return {
          ...access.create(opts.project, opts.name, opts.role),
          notice: 'Save this token now. It is returned only once. Keep it out of source control.',
        };
      } finally {
        access.close();
      }
    }),
  );
accessCommands
  .command('list')
  .requiredOption('--project <id>', 'Project ID')
  .action((opts) =>
    useStore((store) => {
      store.getProject(opts.project);
      const access = new AccessManager(storePath());
      try {
        return access.list(opts.project);
      } finally {
        access.close();
      }
    }),
  );
accessCommands.command('revoke <keyId>').action((keyId) =>
  useStore(() => {
    const access = new AccessManager(storePath());
    try {
      return access.revoke(keyId);
    } finally {
      access.close();
    }
  }),
);
const projects = program.command('project').description('Manage isolated projects');
projects.command('list').action(() => useStore((store) => store.listProjects()));
projects
  .command('create <name>')
  .option('--description <text>', 'Description', '')
  .action((name, opts) =>
    useStore((store) => store.createProject({ name, description: opts.description })),
  );
const streams = program.command('stream').description('Manage parallel lines of work');
streams
  .command('list')
  .option('--project <id>', 'Project ID (defaults to this directory)')
  .action((opts) =>
    useStore((store) => store.listStreams(selectedProject(storePath(), opts.project))),
  );
streams
  .command('create <name>')
  .option('--project <id>', 'Project ID (defaults to this directory)')
  .option('--agent <name>', 'Agent name', 'Human')
  .option('--branch <name>', 'Git branch', '')
  .option('--description <text>', 'Task scope', '')
  .option('--color <hex>', 'Stream color', '#5476d4')
  .action((name, opts) =>
    useStore((store) =>
      store.createStream({
        name,
        projectId: selectedProject(storePath(), opts.project),
        agent: opts.agent,
        branch: opts.branch,
        description: opts.description,
        color: opts.color,
      }),
    ),
  );
streams
  .command('inspect <id>')
  .action((streamId) => useStore((store) => store.getStreamState(streamId)));
program
  .command('publish')
  .description('Publish a versioned context capsule')
  .requiredOption('--project <id>', 'Project ID')
  .option('--stream <id>', 'Owning stream (omit for project context)')
  .requiredOption('--title <text>', 'Short title')
  .option('--body <text>', 'Context text')
  .option('--file <path>', 'Read context text from file')
  .option('--kind <kind>', 'decision, fact, constraint, question, artifact', 'fact')
  .option('--key <key>', 'Semantic key for conflict detection', '')
  .option('--author <name>', 'Author', 'local')
  .option('--tags <tags>', 'Comma-separated tags', '')
  .option('--priority <number>', 'Priority 0-100', '50')
  .option('--source <uri>', 'Source evidence URI')
  .option('--depends-on <refs>', 'Comma-separated CAPSULE_ID@VERSION references', '')
  .action(async (opts) => {
    const content = opts.file ? await readFile(resolve(opts.file), 'utf8') : opts.body;
    return useStore((store) =>
      store.publishCapsule({
        projectId: opts.project,
        streamId: opts.stream,
        title: opts.title,
        body: content,
        kind: opts.kind as CapsuleKind,
        key: opts.key,
        author: opts.author,
        tags: opts.tags.split(',').filter(Boolean),
        priority: number(opts.priority),
        dependencies: opts.dependsOn
          ? opts.dependsOn.split(',').map((ref: string) => {
              const [capsuleId, v] = ref.split('@');
              return { capsuleId, version: number(v) };
            })
          : [],
        evidence: opts.source ? [{ label: 'Source', uri: opts.source }] : [],
      }),
    );
  });
program
  .command('revise <id>')
  .description('Create a new immutable revision; rejects stale writers')
  .requiredOption('--expected-version <number>', 'Version you read')
  .option('--title <text>', 'Updated title')
  .option('--body <text>', 'Updated body')
  .option('--file <path>', 'Read body from file')
  .option('--note <text>', 'Reason for change', 'Updated context')
  .option(
    '--depends-on <refs>',
    'Replace dependencies with comma-separated CAPSULE_ID@VERSION; empty clears',
  )
  .option('--author <name>', 'Author', 'local')
  .action(async (capsuleId, opts) =>
    useStore(async (store) =>
      store.reviseCapsule(capsuleId, {
        expectedVersion: number(opts.expectedVersion),
        title: opts.title,
        body: opts.file ? await readFile(resolve(opts.file), 'utf8') : opts.body,
        changeNote: opts.note,
        author: opts.author,
        dependencies:
          opts.dependsOn === undefined
            ? undefined
            : opts.dependsOn
              ? opts.dependsOn.split(',').map((ref: string) => {
                  const [capsuleId, v] = ref.split('@');
                  return { capsuleId, version: number(v) };
                })
              : [],
      }),
    ),
  );
program
  .command('status <id> <status>')
  .description('Set a capsule active, superseded, or retracted')
  .requiredOption('--expected-version <number>', 'Version you read')
  .action((capsuleId, status, opts) =>
    useStore((store) =>
      store.setCapsuleStatus(capsuleId, status as CapsuleStatus, number(opts.expectedVersion)),
    ),
  );
program
  .command('inspect <id>')
  .description('Inspect capsule revisions, a packet, or a stream')
  .action((entityId) =>
    useStore((store) =>
      entityId.startsWith('pkt_')
        ? store.getPacket(entityId)
        : entityId.startsWith('str_')
          ? store.getStreamState(entityId)
          : { capsule: store.getCapsule(entityId), revisions: store.getRevisions(entityId) },
    ),
  );
program
  .command('mount <capsuleId>')
  .description('Subscribe a stream to shared context')
  .requiredOption('--stream <id>', 'Consumer stream')
  .option('--pin <version>', 'Pin an exact revision; otherwise follows latest')
  .action((capsuleId, opts) =>
    useStore((store) =>
      store.mount({
        streamId: opts.stream,
        capsuleId,
        mode: opts.pin ? 'pinned' : 'live',
        pinnedVersion: opts.pin ? number(opts.pin) : undefined,
      }),
    ),
  );
program
  .command('unmount <mountId>')
  .description('Remove a stream subscription')
  .action((mountId) =>
    useStore((store) => {
      store.unmount(mountId);
      return { ok: true };
    }),
  );
program
  .command('compile <streamId>')
  .description('Compile a bounded context packet with an exact revision manifest')
  .option('--task <text>', 'Current task', '')
  .option('--budget <tokens>', 'Estimated token budget', '4000')
  .option('--text', 'Output plain context for piping into an agent')
  .option('--out <path>', 'Write packet JSON to a file')
  .action(async (streamId, opts) =>
    useStore(async (store) => {
      const packet = store.compile({ streamId, task: opts.task, budget: number(opts.budget) });
      if (opts.out) {
        const path = resolve(opts.out);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(packet, null, 2) + '\n');
      }
      if (opts.text) {
        process.stdout.write(packet.text);
        return;
      }
      return packet;
    }),
  );
program
  .command('check [streamId]')
  .description(
    'Exit 2 when the latest packet is stale, conflicted, or missing; suitable for local preflight',
  )
  .option('--packet <id>', 'Check a specific immutable packet instead of the latest stream packet')
  .option('--root <path>', 'Also verify source fingerprints under this explicit repository root')
  .action((streamId, opts) =>
    useStore(async (store) => {
      if (opts.packet) {
        const check = store.checkPacket(opts.packet);
        const sources = opts.root
          ? await checkSources(store, { root: opts.root, packetId: opts.packet })
          : undefined;
        const ok = check.ok && (sources?.ok ?? true);
        if (!ok) process.exitCode = 2;
        return { ...check, ok, ...(sources ? { sources } : {}) };
      }
      if (!streamId) throw new LoomplaneError('Provide a stream ID or --packet');
      const state = store.getStreamState(streamId);
      if (!state.latestPacket) {
        process.exitCode = 2;
        return { ok: false, streamId, reason: 'No packet compiled' };
      }
      const check = store.checkPacket(state.latestPacket.id);
      const sources = opts.root
        ? await checkSources(store, { root: opts.root, packetId: state.latestPacket.id })
        : undefined;
      const ok = check.ok && (sources?.ok ?? true);
      if (!ok) process.exitCode = 2;
      return { ...check, ok, streamId, ...(sources ? { sources } : {}) };
    }),
  );
const receipts = program
  .command('receipt')
  .description('Register caller-reported packet use; completion refuses stale context');
receipts
  .command('start')
  .requiredOption('--packet <id>', 'Exact packet used')
  .requiredOption('--agent <name>', 'Agent identity (caller-reported)')
  .action((opts) => useStore((store) => store.startReceipt(opts.packet, opts.agent)));
receipts
  .command('finish <id>')
  .option('--outcome <text>', 'What was done', '')
  .option('--commit <sha>', 'Associated Git commit', '')
  .option('--abandon', 'Record this run as abandoned')
  .action((id, opts) =>
    useStore((store) =>
      store.finishReceipt(id, {
        status: opts.abandon ? 'abandoned' : 'completed',
        outcome: opts.outcome,
        gitCommit: opts.commit,
      }),
    ),
  );
receipts
  .command('list')
  .requiredOption('--project <id>', 'Project ID')
  .action((opts) => useStore((store) => store.listReceipts(opts.project)));
const source = program
  .command('source')
  .description('Explicitly fingerprint local evidence and detect changed source files');
source
  .command('attach <capsuleId>')
  .requiredOption('--file <path>', 'Explicit source file')
  .option('--root <path>', 'Repository root', process.cwd())
  .requiredOption('--expected-version <number>', 'Capsule version you read')
  .action((capsuleId, opts) =>
    useStore(async (store) => {
      const capsule = store.getCapsule(capsuleId);
      const reference = await fingerprintSource(opts.root, opts.file);
      return store.reviseCapsule(capsuleId, {
        expectedVersion: number(opts.expectedVersion),
        evidence: [
          ...capsule.evidence.filter((e) => e.fingerprint?.path !== reference.fingerprint?.path),
          reference,
        ],
        changeNote: `Recorded source fingerprint: ${reference.fingerprint!.path}`,
      });
    }),
  );
source
  .command('check')
  .requiredOption('--root <path>', 'Explicit repository root')
  .option('--project <id>', 'Check current project capsules')
  .option('--packet <id>', 'Check exact packet revisions')
  .action((opts) =>
    useStore(async (store) => {
      const result = await checkSources(store, {
        root: opts.root,
        projectId: opts.project,
        packetId: opts.packet,
      });
      if (!result.ok) process.exitCode = 2;
      return result;
    }),
  );
program
  .command('impact <capsuleId>')
  .description('Show direct and transitive consumers and affected run receipts')
  .action((capsuleId) => useStore((store) => store.impact(capsuleId)));
program
  .command('search <query>')
  .requiredOption('--project <id>', 'Project ID')
  .action((query, opts) => useStore((store) => store.search(opts.project, query)));
program
  .command('events')
  .requiredOption('--project <id>', 'Project ID')
  .action((opts) => useStore((store) => store.events(opts.project)));
program
  .command('export')
  .description('Export project, evidence, revisions and packets as portable JSON')
  .requiredOption('--project <id>', 'Project ID')
  .option('--out <path>', 'Write file instead of stdout')
  .action((opts) =>
    useStore(async (store) => {
      const result = store.exportProject(opts.project);
      if (opts.out) {
        const path = resolve(opts.out);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(result, null, 2) + '\n');
        return { written: path };
      }
      return result;
    }),
  );
program
  .command('restore <path>')
  .description('Restore a portable project archive; rejects existing IDs without overwriting')
  .option('--select', 'Select the restored project and its first stream in this directory')
  .action(async (path, opts) => {
    const absolute = resolve(path);
    const info = await stat(absolute);
    if (!info.isFile() || info.size > 32 * 1024 * 1024)
      throw new LoomplaneError('Restore requires a JSON file no larger than 32 MiB');
    const content = await readFile(absolute, 'utf8');
    const bundle = JSON.parse(content);
    return useStore((store) => {
      const project = store.restoreProject(bundle);
      const stream = store.listStreams(project.id)[0];
      if (opts.select && stream)
        writeSelection({ database: storePath(), projectId: project.id, streamId: stream.id });
      return { project, restored: true, selected: !!opts.select && !!stream };
    });
  });
program
  .command('import <path>')
  .description('Import an explicitly selected local Markdown or agent session file')
  .requiredOption('--project <id>', 'Target project')
  .option('--stream <id>', 'Target stream')
  .option('--format <format>', 'auto, markdown, codex, claude', 'auto')
  .action(async (path, opts) => {
    const { importFile } = await import('../adapters/index.js');
    return useStore((store) =>
      importFile(store, {
        projectId: opts.project,
        streamId: opts.stream,
        path: resolve(path),
        format: opts.format,
      }),
    );
  });
program
  .command('mcp')
  .description('Start stdio MCP using local SQLite or a remote Loomplane API')
  .option(
    '--url <url>',
    'Remote server URL (or LOOMPLANE_URL); credential from LOOMPLANE_API_TOKEN',
  )
  .action(async (opts) => {
    const { startMcp, startRemoteMcp } = await import('../mcp/index.js');
    const url = opts.url ?? process.env.LOOMPLANE_URL;
    if (url) {
      if (program.getOptionValueSource('db') === 'cli')
        throw new LoomplaneError(
          'Choose --db for local storage or --url for remote access, not both.',
        );
      await startRemoteMcp({ url, token: process.env.LOOMPLANE_API_TOKEN });
    } else await startMcp(storePath());
  });

program.parseAsync().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof LoomplaneError ? error.code : 'ERROR',
    }) + '\n',
  );
  process.exitCode = 1;
});
