import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { Store, WeftError } from '../core/store.js';
import { seedDemo } from '../core/demo.js';

interface ServerOptions { port?: number; host?: string; token?: string; dev?: boolean; webRoot?: string }
const MIME: Record<string,string> = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json','.woff2':'font/woff2'};
function respond(res: ServerResponse, status: number, value: unknown) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []; let length = 0;
  for await(const chunk of req) { length += chunk.length; if(length > 2_000_000) throw new WeftError('Request exceeds 2 MB',413,'TOO_LARGE'); chunks.push(chunk); }
  if(!length) return {};
  try { const data = JSON.parse(Buffer.concat(chunks).toString()); if(!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; }
  catch { throw new WeftError('Request body must be a JSON object',400,'INVALID_JSON'); }
}
function safeEqual(a:string,b:string) { const x=Buffer.from(a); const y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }

export function createWeftServer(store: Store, options: ServerOptions = {}) {
  const port = options.port ?? 4318; const host = options.host ?? '127.0.0.1';
  const loopback = ['127.0.0.1','localhost','::1'].includes(host);
  if(!loopback && !options.token) throw new WeftError('Set WEFT_TOKEN to bind outside localhost. For shared deployments, put TLS and identity controls in front of Weft.');
  const clients = new Set<ServerResponse>();
  let version = store.getChangeVersion();
  const poll = setInterval(()=>{ const next=store.getChangeVersion(); if(next!==version) { version=next; for(const client of clients) client.write(`event: change\ndata: ${JSON.stringify({at:new Date().toISOString()})}\n\n`); } },750);
  poll.unref();
  const base = resolve(fileURLToPath(new URL('../../',import.meta.url)));
  const webRoot = options.webRoot ?? resolve(base,'dist/web');
  const server = createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    try {
      const hostname = (req.headers.host ?? '').replace(/:\d+$/,'').replace(/^\[|\]$/g,'');
      if(loopback && !['127.0.0.1','localhost','::1'].includes(hostname)) throw new WeftError('Unrecognized Host header',403,'HOST_REJECTED');
      const url = new URL(req.url ?? '/',`http://${req.headers.host || 'localhost'}`);
      const method=req.method ?? 'GET'; const path=url.pathname;
      if(path.startsWith('/api/')) {
        const origin=req.headers.origin;
        if(origin) {
          let originUrl: URL; try { originUrl = new URL(origin); } catch { throw new WeftError('Invalid origin',403,'ORIGIN_REJECTED'); }
          const same = originUrl.host === req.headers.host;
          const localDev = options.dev && ['localhost','127.0.0.1','[::1]'].includes(originUrl.hostname) && originUrl.port === '5173';
          if(!same && !localDev) throw new WeftError('Cross-origin API access is disabled',403,'ORIGIN_REJECTED');
        }
        if(options.token) {
          const auth=req.headers.authorization ?? '';
          if(!safeEqual(auth,`Bearer ${options.token}`)) throw new WeftError('Bearer token required',401,'UNAUTHORIZED');
        }
        if(method!=='GET' && method!=='DELETE' && !req.headers['content-type']?.startsWith('application/json')) throw new WeftError('Use application/json',415,'CONTENT_TYPE');
        if(method==='GET' && path==='/api/health') return respond(res,200,{ok:true,version:'0.1.0'});
        if(method==='GET' && path==='/api/changes') {
          res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'}); res.write(': connected\n\n'); clients.add(res);
          const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),20000); heartbeat.unref();
          req.on('close',()=>{clients.delete(res);clearInterval(heartbeat);}); return;
        }
        const projectId=url.searchParams.get('projectId') ?? undefined;
        if(method==='GET' && path==='/api/snapshot') return respond(res,200,store.snapshot(projectId));
        if(method==='GET' && path==='/api/projects') return respond(res,200,store.listProjects());
        if(method==='POST' && path==='/api/projects') return respond(res,201,store.createProject(await body(req)));
        if(method==='POST' && path==='/api/streams') return respond(res,201,store.createStream(await body(req)));
        if(method==='POST' && path==='/api/capsules') return respond(res,201,store.publishCapsule(await body(req)));
        if(method==='POST' && path==='/api/mounts') return respond(res,201,store.mount(await body(req)));
        if(method==='POST' && path==='/api/compile') return respond(res,201,store.compile(await body(req)));
        if(method==='POST' && path==='/api/demo') return respond(res,201,seedDemo(store));
        if(method==='GET' && (path==='/api/search' || path==='/api/events' || path==='/api/export')) {
          if(!projectId) throw new WeftError('projectId is required');
          if(path==='/api/search') return respond(res,200,store.search(projectId,url.searchParams.get('q')??''));
          if(path==='/api/events') return respond(res,200,store.events(projectId));
          res.setHeader('Content-Disposition',`attachment; filename="weft-${projectId}.json"`); return respond(res,200,store.exportProject(projectId));
        }
        const match = path.match(/^\/api\/(streams|capsules|mounts|packets)\/([a-zA-Z0-9_-]+)(?:\/(status))?$/);
        if(match) {
          const [,resource,entityId,action]=match;
          if(resource==='streams' && !action) {
            if(method==='GET') return respond(res,200,store.getStreamState(entityId));
            if(method==='PATCH') return respond(res,200,store.updateStream(entityId,await body(req)));
          }
          if(resource==='capsules') {
            if(method==='GET' && !action) return respond(res,200,{capsule:store.getCapsule(entityId),revisions:store.getRevisions(entityId)});
            if(method==='PATCH' && !action) return respond(res,200,store.reviseCapsule(entityId,await body(req)));
            if(method==='POST' && action==='status') { const input=await body(req); return respond(res,200,store.setCapsuleStatus(entityId,input.status,input.expectedVersion,input.author)); }
          }
          if(resource==='mounts' && method==='DELETE' && !action) { store.unmount(entityId); return respond(res,200,{ok:true}); }
          if(resource==='packets' && method==='GET' && !action) return respond(res,200,store.getPacket(entityId));
        }
        throw new WeftError('API route not found',404,'NOT_FOUND');
      }
      if(method!=='GET' && method!=='HEAD') throw new WeftError('Method not allowed',405,'METHOD_NOT_ALLOWED');
      const decoded=decodeURIComponent(path); const requested=resolve(webRoot,`.${decoded}`);
      if(requested!==webRoot && !requested.startsWith(webRoot+sep)) throw new WeftError('Invalid path',403,'INVALID_PATH');
      let target=requested;
      try { if(!(await stat(target)).isFile()) target=resolve(webRoot,'index.html'); } catch { target=resolve(webRoot,'index.html'); }
      let data:Buffer;
      try { data=await readFile(target); } catch { res.writeHead(200,{'Content-Type':'text/html'}); res.end('<html><body style="font-family:system-ui;max-width:680px;margin:80px auto"><h1>Weft is running.</h1><p>Build the workbench with <code>npm run build</code>, or start <code>npm run dev:web</code> and open <a href="http://localhost:5173">localhost:5173</a>.</p><p>The API is available at <a href="/api/health">/api/health</a>.</p></body></html>'); return; }
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'");
      res.writeHead(200,{'Content-Type':MIME[extname(target)]??'application/octet-stream','Cache-Control':extname(target)==='.html'?'no-cache':'public, max-age=3600'}); res.end(method==='HEAD'?undefined:data);
    } catch(error) {
      if(res.headersSent) { res.end(); return; }
      const known=error instanceof WeftError;
      if(!known) console.error(error);
      respond(res,known?error.status:500,{error:known?error.message:'An internal error occurred. Check the server log.',code:known?error.code:'INTERNAL_ERROR'});
    }
  });
  server.on('close',()=>{clearInterval(poll);for(const c of clients)c.end();});
  return server;
}
export async function startServer(store: Store, options: ServerOptions = {}) {
  const server=createWeftServer(store,options);
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port??4318,options.host??'127.0.0.1',()=>resolve());});
  return server;
}
