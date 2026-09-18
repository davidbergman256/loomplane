import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { Store, LoomplaneError } from '../core/store.js';
import { idempotencyFingerprint } from '../core/idempotency.js';
import { AccessManager, type AccessKey } from './access.js';
import { seedDemo } from '../core/demo.js';

interface ServerOptions {
  port?: number;
  host?: string;
  token?: string;
  dev?: boolean;
  webRoot?: string;
  access?: AccessManager;
}
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
function respond(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 2_000_000) throw new LoomplaneError('Request exceeds 2 MB', 413, 'TOO_LARGE');
    chunks.push(chunk);
  }
  if (!length) return {};
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new LoomplaneError('Request body must be a JSON object', 400, 'INVALID_JSON');
  }
}
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createLoomplaneServer(store: Store, options: ServerOptions = {}) {
  const port = options.port ?? 4318;
  const host = options.host ?? '127.0.0.1';
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (!loopback && !options.token && !options.access)
    throw new LoomplaneError(
      'Set LOOMPLANE_TOKEN to bind outside localhost. For shared deployments, put TLS and identity controls in front of Loomplane.',
    );
  const clients = new Map<
    ServerResponse,
    { projectId?: string; token?: string; version: number }
  >();
  const poll = setInterval(() => {
    const globalVersion = store.getChangeVersion();
    for (const [client, state] of clients) {
      if (state.token && !options.access?.authenticate(state.token)) {
        client.end();
        clients.delete(client);
        continue;
      }
      const next = state.projectId ? options.access!.changeVersion(state.projectId) : globalVersion;
      if (next !== state.version) {
        state.version = next;
        client.write(
          `event: change\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
        );
      }
    }
  }, 750);
  poll.unref();
  const base = resolve(fileURLToPath(new URL('../../', import.meta.url)));
  const webRoot = options.webRoot ?? resolve(base, 'dist/web');
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      const hostname = (req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
      if (loopback && !['127.0.0.1', 'localhost', '::1'].includes(hostname))
        throw new LoomplaneError('Unrecognized Host header', 403, 'HOST_REJECTED');
      const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
      const method = req.method ?? 'GET';
      const path = url.pathname;
      let parsedBody: any;
      if (path.startsWith('/api/')) {
        const origin = req.headers.origin;
        if (origin) {
          let originUrl: URL;
          try {
            originUrl = new URL(origin);
          } catch {
            throw new LoomplaneError('Invalid origin', 403, 'ORIGIN_REJECTED');
          }
          const same = originUrl.host === req.headers.host;
          const localDev =
            options.dev &&
            ['localhost', '127.0.0.1', '[::1]'].includes(originUrl.hostname) &&
            originUrl.port === '5173';
          if (!same && !localDev)
            throw new LoomplaneError('Cross-origin API access is disabled', 403, 'ORIGIN_REJECTED');
        }
        let principal: AccessKey | null = null;
        const authorization = req.headers.authorization ?? '';
        const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
        const authenticatedAdmin =
          !!options.token && safeEqual(authorization, `Bearer ${options.token}`);
        const authRequired = !!options.token || !!options.access;
        if (path === '/api/auth' && method === 'GET' && !authorization)
          return respond(res, 200, {
            required: authRequired,
            authenticated: !authRequired,
            role: authRequired ? null : 'local',
          });
        if (authRequired && !authenticatedAdmin) {
          principal = options.access?.authenticate(token) ?? null;
          if (!principal)
            throw new LoomplaneError('A valid bearer token is required', 401, 'UNAUTHORIZED');
        }
        const assertCurrentPrincipal = () => {
          if (!principal) return;
          const current = options.access!.authenticate(token);
          if (!current || current.id !== principal.id || current.projectId !== principal.projectId)
            throw new LoomplaneError('A valid bearer token is required', 401, 'UNAUTHORIZED');
          if (method !== 'GET' && current.role !== 'writer')
            throw new LoomplaneError('This key is read-only', 403, 'FORBIDDEN');
        };
        const requestBody = async () => {
          if (parsedBody === undefined) parsedBody = await body(req);
          // A request may wait for its body while the credential is revoked.
          assertCurrentPrincipal();
          return parsedBody;
        };
        if (path === '/api/auth' && method === 'GET')
          return respond(res, 200, {
            required: authRequired,
            authenticated: true,
            role: principal?.role ?? (authenticatedAdmin ? 'admin' : 'local'),
            projectId: principal?.projectId ?? null,
          });
        const assertProject = (projectId: unknown) => {
          if (principal && projectId !== principal.projectId)
            throw new LoomplaneError('Resource not found', 404, 'NOT_FOUND');
        };
        const assertResource = (kind: string, entityId: unknown) => {
          if (
            principal &&
            (typeof entityId !== 'string' ||
              options.access!.projectForResource(kind, entityId) !== principal.projectId)
          )
            throw new LoomplaneError('Resource not found', 404, 'NOT_FOUND');
        };
        const assertCapsuleReferences = (input: any) => {
          if (input.streamId !== undefined && input.streamId !== null && input.streamId !== '') {
            if (typeof input.streamId !== 'string')
              throw new LoomplaneError('streamId must be text');
            assertResource('streams', input.streamId);
          }
          if (input.dependencies !== undefined) {
            if (!Array.isArray(input.dependencies) || input.dependencies.length > 50)
              throw new LoomplaneError(
                'dependencies must be an array of at most 50 revision references',
              );
            for (const dependency of input.dependencies) {
              if (
                !dependency ||
                typeof dependency !== 'object' ||
                Array.isArray(dependency) ||
                typeof dependency.capsuleId !== 'string' ||
                !dependency.capsuleId.trim()
              )
                throw new LoomplaneError('Invalid context dependency');
              assertResource('capsules', dependency.capsuleId.trim());
            }
          }
        };
        if (principal) {
          if (method !== 'GET' && principal.role !== 'writer')
            throw new LoomplaneError('This key is read-only', 403, 'FORBIDDEN');
          if (path === '/api/demo' || (path === '/api/projects' && method !== 'GET'))
            throw new LoomplaneError('Instance administrator access required', 403, 'FORBIDDEN');
          const resource = path.match(
            /^\/api\/(streams|capsules|mounts|packets|receipts)\/([a-zA-Z0-9_-]+)(?:\/[^/]+)?$/,
          );
          if (resource) assertResource(resource[1], resource[2]);
          if (url.searchParams.has('projectId')) assertProject(url.searchParams.get('projectId'));
          if (method === 'POST') {
            if (path === '/api/streams' || path === '/api/capsules')
              assertProject((await requestBody()).projectId);
            if (path === '/api/capsules') assertCapsuleReferences(await requestBody());
            if (path === '/api/mounts') {
              const input = await requestBody();
              assertResource('streams', input.streamId);
              assertResource('capsules', input.capsuleId);
            }
            if (path === '/api/compile') assertResource('streams', (await requestBody()).streamId);
            if (path === '/api/receipts') assertResource('packets', (await requestBody()).packetId);
          }
          if (method === 'PATCH' && /^\/api\/capsules\/[a-zA-Z0-9_-]+$/.test(path))
            assertCapsuleReferences(await requestBody());
        }
        const rawIdempotencyKey = req.headers['idempotency-key'];
        if (Array.isArray(rawIdempotencyKey))
          throw new LoomplaneError(
            'Idempotency-Key must be a single value',
            400,
            'INVALID_IDEMPOTENCY_INPUT',
          );
        if (method === 'DELETE' && rawIdempotencyKey !== undefined)
          throw new LoomplaneError(
            'Idempotency-Key is supported only for JSON POST and PATCH requests',
            400,
            'INVALID_IDEMPOTENCY_INPUT',
          );
        const idempotencyScope = principal
          ? `key:${principal.id}`
          : authenticatedAdmin
            ? 'admin:instance'
            : 'local:instance';
        const writeJson = async <T>(status: number, mutation: (input: any) => T) => {
          const input = await requestBody();
          // Authorization is deliberately current immediately before both a replay and a mutation.
          assertCurrentPrincipal();
          if (rawIdempotencyKey === undefined) return respond(res, status, mutation(input));
          const result = store.idempotent(
            {
              scope: idempotencyScope,
              key: rawIdempotencyKey,
              operation: `${method} ${path}`,
              fingerprint: idempotencyFingerprint(input),
            },
            () => ({ status, body: mutation(input) }),
          );
          res.setHeader('Idempotency-Replayed', result.replayed ? 'true' : 'false');
          return respond(res, result.value.status, result.value.body);
        };
        if (
          method !== 'GET' &&
          method !== 'DELETE' &&
          !req.headers['content-type']?.startsWith('application/json')
        )
          throw new LoomplaneError('Use application/json', 415, 'CONTENT_TYPE');
        if (method === 'GET' && path === '/api/health')
          return respond(res, 200, { ok: true, version: '0.2.0' });
        if (method === 'GET' && path === '/api/changes') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          res.write(': connected\n\n');
          clients.set(res, {
            projectId: principal?.projectId,
            token: principal ? token : undefined,
            version: principal
              ? options.access!.changeVersion(principal.projectId)
              : store.getChangeVersion(),
          });
          const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
          heartbeat.unref();
          req.on('close', () => {
            clients.delete(res);
            clearInterval(heartbeat);
          });
          return;
        }
        const projectId = url.searchParams.get('projectId') ?? principal?.projectId ?? undefined;
        if (method === 'GET' && path === '/api/snapshot') {
          const snapshot = store.snapshot(projectId);
          if (principal)
            snapshot.projects = snapshot.projects.filter((p) => p.id === principal.projectId);
          return respond(res, 200, snapshot);
        }
        if (method === 'GET' && path === '/api/projects')
          return respond(
            res,
            200,
            principal ? [store.getProject(principal.projectId)] : store.listProjects(),
          );
        if (method === 'POST' && path === '/api/projects')
          return await writeJson(201, (input) => store.createProject(input));
        if (method === 'POST' && path === '/api/streams')
          return await writeJson(201, (input) => store.createStream(input));
        if (method === 'POST' && path === '/api/capsules')
          return await writeJson(201, (input) => store.publishCapsule(input));
        if (method === 'POST' && path === '/api/mounts')
          return await writeJson(201, (input) => store.mount(input));
        if (method === 'POST' && path === '/api/compile')
          return await writeJson(201, (input) => store.compile(input));
        if (method === 'POST' && path === '/api/receipts')
          return await writeJson(201, (input) => store.startReceipt(input.packetId, input.agent));
        if (method === 'GET' && path === '/api/receipts') {
          if (!projectId) throw new LoomplaneError('projectId is required');
          return respond(res, 200, store.listReceipts(projectId));
        }
        const receiptMatch = path.match(/^\/api\/receipts\/([a-zA-Z0-9_-]+)$/);
        if (receiptMatch && method === 'GET')
          return respond(res, 200, {
            receipt: store.getReceipt(receiptMatch[1]),
            check: store.checkPacket(store.getReceipt(receiptMatch[1]).packetId),
          });
        if (receiptMatch && method === 'PATCH')
          return await writeJson(200, (input) => store.finishReceipt(receiptMatch[1], input));
        const impactMatch = path.match(/^\/api\/capsules\/([a-zA-Z0-9_-]+)\/impact$/);
        if (impactMatch && method === 'GET') return respond(res, 200, store.impact(impactMatch[1]));
        const checkMatch = path.match(/^\/api\/packets\/([a-zA-Z0-9_-]+)\/check$/);
        if (checkMatch && method === 'GET')
          return respond(res, 200, store.checkPacket(checkMatch[1]));
        const compareMatch = path.match(/^\/api\/packets\/([a-zA-Z0-9_-]+)\/compare$/);
        if (compareMatch && method === 'GET') {
          const target = url.searchParams.get('to');
          if (!target) throw new LoomplaneError('to packet ID is required');
          assertResource('packets', target);
          return respond(res, 200, store.comparePackets(compareMatch[1], target));
        }
        const historyMatch = path.match(/^\/api\/streams\/([a-zA-Z0-9_-]+)\/packets$/);
        if (historyMatch && method === 'GET')
          return respond(
            res,
            200,
            store.listPackets(historyMatch[1], {
              before: url.searchParams.get('before') ?? undefined,
              limit: url.searchParams.has('limit')
                ? Number(url.searchParams.get('limit'))
                : undefined,
            }),
          );
        if (method === 'POST' && path === '/api/demo')
          return await writeJson(201, () => seedDemo(store));
        if (
          method === 'GET' &&
          (path === '/api/search' || path === '/api/events' || path === '/api/export')
        ) {
          if (!projectId) throw new LoomplaneError('projectId is required');
          if (path === '/api/search')
            return respond(
              res,
              200,
              store.search(
                projectId,
                url.searchParams.get('q') ?? '',
                url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 30,
              ),
            );
          if (path === '/api/events') return respond(res, 200, store.events(projectId));
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="loomplane-${projectId}.json"`,
          );
          return respond(res, 200, store.exportProject(projectId));
        }
        const match = path.match(
          /^\/api\/(streams|capsules|mounts|packets)\/([a-zA-Z0-9_-]+)(?:\/(status))?$/,
        );
        if (match) {
          const [, resource, entityId, action] = match;
          if (resource === 'streams' && !action) {
            if (method === 'GET') return respond(res, 200, store.getStreamState(entityId));
            if (method === 'PATCH')
              return await writeJson(200, (input) => store.updateStream(entityId, input));
          }
          if (resource === 'capsules') {
            if (method === 'GET' && !action)
              return respond(res, 200, {
                capsule: store.getCapsule(entityId),
                revisions: store.getRevisions(entityId),
              });
            if (method === 'PATCH' && !action)
              return await writeJson(200, (input) => store.reviseCapsule(entityId, input));
            if (method === 'POST' && action === 'status') {
              return await writeJson(200, (input) =>
                store.setCapsuleStatus(entityId, input.status, input.expectedVersion, input.author),
              );
            }
          }
          if (resource === 'mounts' && method === 'DELETE' && !action) {
            assertCurrentPrincipal();
            store.unmount(entityId);
            return respond(res, 200, { ok: true });
          }
          if (resource === 'packets' && method === 'GET' && !action)
            return respond(res, 200, store.getPacket(entityId));
        }
        throw new LoomplaneError('API route not found', 404, 'NOT_FOUND');
      }
      if (method !== 'GET' && method !== 'HEAD')
        throw new LoomplaneError('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
      const decoded = decodeURIComponent(path);
      const requested = resolve(webRoot, `.${decoded}`);
      if (requested !== webRoot && !requested.startsWith(webRoot + sep))
        throw new LoomplaneError('Invalid path', 403, 'INVALID_PATH');
      let target = requested;
      try {
        if (!(await stat(target)).isFile()) target = resolve(webRoot, 'index.html');
      } catch {
        target = resolve(webRoot, 'index.html');
      }
      let data: Buffer;
      try {
        data = await readFile(target);
      } catch {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body style="font-family:system-ui;max-width:680px;margin:80px auto"><h1>Loomplane is running.</h1><p>Build the workbench with <code>npm run build</code>, or start <code>npm run dev:web</code> and open <a href="http://localhost:5173">localhost:5173</a>.</p><p>The API is available at <a href="/api/health">/api/health</a>.</p></body></html>',
        );
        return;
      }
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'",
      );
      res.writeHead(200, {
        'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
        'Cache-Control': extname(target) === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      res.end(method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const known = error instanceof LoomplaneError;
      if (!known) console.error(error);
      respond(res, known ? error.status : 500, {
        error: known ? error.message : 'An internal error occurred. Check the server log.',
        code: known ? error.code : 'INTERNAL_ERROR',
      });
    }
  });
  server.on('close', () => {
    clearInterval(poll);
    for (const c of clients.keys()) c.end();
  });
  return server;
}
export async function startServer(store: Store, options: ServerOptions = {}) {
  const server = createLoomplaneServer(store, options);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 4318, options.host ?? '127.0.0.1', () => resolve());
  });
  return server;
}
