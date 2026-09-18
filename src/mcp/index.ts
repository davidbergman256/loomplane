#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMcp, startRemoteMcp } from './server.js';

export { createMcpServer, createMcpServerForPort, startMcp, startRemoteMcp } from './server.js';
export type { McpPort, RemoteMcpOptions } from './server.js';

function argumentValue(argv: string[], name: '--db' | '--url'): string | undefined {
  const equalArgument = argv.find((argument) => argument.startsWith(`${name}=`));
  if (equalArgument) return equalArgument.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0) {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    return value;
  }
  return undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const explicitDb = argumentValue(argv, '--db');
  const remoteUrl = argumentValue(argv, '--url') ?? process.env.LOOMPLANE_URL;
  if (remoteUrl && explicitDb)
    throw new Error('Choose --url for remote API access or --db for local SQLite, not both');
  if (remoteUrl) {
    await startRemoteMcp({ url: remoteUrl, token: process.env.LOOMPLANE_API_TOKEN });
    return;
  }
  await startMcp(resolve(explicitDb ?? process.env.LOOMPLANE_DB ?? '.loomplane/loomplane.sqlite'));
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
