#!/usr/bin/env node
import { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { Store, WeftError } from '../core/store.js';
import { seedDemo } from '../core/demo.js';
import { startServer } from '../server/index.js';
import type { CapsuleKind, CapsuleStatus } from '../core/types.js';

const program = new Command().name('weft').description('Shared, versioned context for parallel coding agents.').version('0.1.0')
  .option('--db <path>','SQLite database path',process.env.WEFT_DB ?? '.weft/weft.sqlite')
  .option('--json','Output structured JSON (default for data commands)');
const out=(value:unknown)=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
const storePath=()=>resolve(program.opts().db);
async function useStore(fn:(store:Store)=>unknown|Promise<unknown>) { const store=new Store(storePath()); try { const result=await fn(store); if(result!==undefined) out(result); } finally {store.close();} }
const number=(value:string)=>{if(!/^\d+$/.test(value))throw new WeftError('Expected a positive integer');return Number(value);};

program.command('init').description('Create a local project and a first working stream; no files are imported')
  .option('--name <name>','Project name',basename(process.cwd())).option('--description <text>','Project description','')
  .action(async(opts)=>useStore(store=>{const project=store.createProject(opts);const stream=store.createStream({projectId:project.id,name:'Main',description:'Working context for this project'});return {project,stream,database:storePath(),next:`weft publish --project ${project.id} --stream ${stream.id} --kind decision --title "Your decision" --body "What the next agent needs to know"`};}));
program.command('demo').description('Seed the explicitly synthetic Orbit demonstration')
  .action(async()=>useStore(store=>({...seedDemo(store),next:'weft serve'})));
program.command('serve').description('Run the local API and web workbench')
  .option('--port <number>','Listen port','4318').option('--host <host>','Listen address','127.0.0.1').option('--dev','Allow local Vite development origin')
  .option('--demo','Seed synthetic demonstration before starting')
  .action(async(opts)=>{
    const store=new Store(storePath());
    try {
      if(opts.demo) seedDemo(store);
      const port=number(opts.port);if(port<1||port>65535)throw new WeftError('Port must be between 1 and 65535');
      const server=await startServer(store,{port,host:opts.host,dev:opts.dev,token:process.env.WEFT_TOKEN});
      console.error(`Weft workbench: http://${opts.host}:${port}\nDatabase: ${storePath()}\n${process.env.WEFT_TOKEN?'Bearer token enabled.':''}`);
      const stop=()=>{server.close(()=>{store.close();process.exit(0);});server.closeAllConnections();};
      process.on('SIGINT',stop);process.on('SIGTERM',stop);
    } catch(error) {store.close();throw error;}
  });
const projects=program.command('project').description('Manage isolated projects');
projects.command('list').action(()=>useStore(store=>store.listProjects()));
projects.command('create <name>').option('--description <text>','Description','').action((name,opts)=>useStore(store=>store.createProject({name,description:opts.description})));
const streams=program.command('stream').description('Manage parallel lines of work');
streams.command('list').requiredOption('--project <id>','Project ID').action(opts=>useStore(store=>store.listStreams(opts.project)));
streams.command('create <name>').requiredOption('--project <id>','Project ID').option('--agent <name>','Agent name','Human').option('--branch <name>','Git branch','').option('--description <text>','Task scope','').option('--color <hex>','Stream color','#5476d4')
  .action((name,opts)=>useStore(store=>store.createStream({name,projectId:opts.project,agent:opts.agent,branch:opts.branch,description:opts.description,color:opts.color})));
streams.command('inspect <id>').action(streamId=>useStore(store=>store.getStreamState(streamId)));
program.command('publish').description('Publish a versioned context capsule')
  .requiredOption('--project <id>','Project ID').option('--stream <id>','Owning stream (omit for project context)')
  .requiredOption('--title <text>','Short title').option('--body <text>','Context text').option('--file <path>','Read context text from file')
  .option('--kind <kind>','decision, fact, constraint, question, artifact','fact').option('--key <key>','Semantic key for conflict detection','')
  .option('--author <name>','Author','local').option('--tags <tags>','Comma-separated tags','').option('--priority <number>','Priority 0-100','50')
  .option('--source <uri>','Source evidence URI').action(async(opts)=>{
    const content=opts.file?await readFile(resolve(opts.file),'utf8'):opts.body;
    return useStore(store=>store.publishCapsule({projectId:opts.project,streamId:opts.stream,title:opts.title,body:content,kind:opts.kind as CapsuleKind,key:opts.key,author:opts.author,tags:opts.tags.split(',').filter(Boolean),priority:number(opts.priority),evidence:opts.source?[{label:'Source',uri:opts.source}]:[]}));
  });
program.command('revise <id>').description('Create a new immutable revision; rejects stale writers')
  .requiredOption('--expected-version <number>','Version you read').option('--title <text>','Updated title').option('--body <text>','Updated body').option('--file <path>','Read body from file').option('--note <text>','Reason for change','Updated context').option('--author <name>','Author','local')
  .action(async(capsuleId,opts)=>useStore(async store=>store.reviseCapsule(capsuleId,{expectedVersion:number(opts.expectedVersion),title:opts.title,body:opts.file?await readFile(resolve(opts.file),'utf8'):opts.body,changeNote:opts.note,author:opts.author})));
program.command('status <id> <status>').description('Set a capsule active, superseded, or retracted')
  .requiredOption('--expected-version <number>','Version you read').action((capsuleId,status,opts)=>useStore(store=>store.setCapsuleStatus(capsuleId,status as CapsuleStatus,number(opts.expectedVersion))));
program.command('inspect <id>').description('Inspect capsule revisions, a packet, or a stream')
  .action(entityId=>useStore(store=>entityId.startsWith('pkt_')?store.getPacket(entityId):entityId.startsWith('str_')?store.getStreamState(entityId):{capsule:store.getCapsule(entityId),revisions:store.getRevisions(entityId)}));
program.command('mount <capsuleId>').description('Subscribe a stream to shared context')
  .requiredOption('--stream <id>','Consumer stream').option('--pin <version>','Pin an exact revision; otherwise follows latest')
  .action((capsuleId,opts)=>useStore(store=>store.mount({streamId:opts.stream,capsuleId,mode:opts.pin?'pinned':'live',pinnedVersion:opts.pin?number(opts.pin):undefined})));
program.command('unmount <mountId>').description('Remove a stream subscription').action(mountId=>useStore(store=>{store.unmount(mountId);return {ok:true};}));
program.command('compile <streamId>').description('Compile a bounded context packet with an exact revision manifest')
  .option('--task <text>','Current task','').option('--budget <tokens>','Estimated token budget','4000').option('--text','Output plain context for piping into an agent').option('--out <path>','Write packet JSON to a file')
  .action(async(streamId,opts)=>useStore(async store=>{const packet=store.compile({streamId,task:opts.task,budget:number(opts.budget)});if(opts.out){const path=resolve(opts.out);await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(packet,null,2)+'\n');}if(opts.text){process.stdout.write(packet.text);return;}return packet;}));
program.command('check <streamId>').description('Exit 2 when the latest packet is stale, conflicted, or missing; suitable for local preflight')
  .action(streamId=>useStore(store=>{const state=store.getStreamState(streamId);const stale=state.drift.filter(d=>!d.pinned);const ok=!!state.latestPacket&&stale.length===0&&state.conflicts.length===0;if(!ok)process.exitCode=2;return {ok,streamId,packetId:state.latestPacket?.id??null,drift:stale,conflicts:state.conflicts,pinnedUpdates:state.drift.filter(d=>d.pinned)};}));
program.command('search <query>').requiredOption('--project <id>','Project ID').action((query,opts)=>useStore(store=>store.search(opts.project,query)));
program.command('events').requiredOption('--project <id>','Project ID').action(opts=>useStore(store=>store.events(opts.project)));
program.command('export').description('Export project, evidence, revisions and packets as portable JSON')
  .requiredOption('--project <id>','Project ID').option('--out <path>','Write file instead of stdout')
  .action(opts=>useStore(async store=>{const result=store.exportProject(opts.project);if(opts.out){const path=resolve(opts.out);await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(result,null,2)+'\n');return {written:path};}return result;}));
program.command('import <path>').description('Import an explicitly selected local Markdown or agent session file')
  .requiredOption('--project <id>','Target project').option('--stream <id>','Target stream').option('--format <format>','auto, markdown, codex, claude','auto')
  .action(async(path,opts)=>{const {importFile}=await import('../adapters/index.js');return useStore(store=>importFile(store,{projectId:opts.project,streamId:opts.stream,path:resolve(path),format:opts.format}));});
program.command('mcp').description('Start stdio MCP server for agent clients').action(async()=>{const {startMcp}=await import('../mcp/index.js');await startMcp(storePath());});

program.parseAsync().catch(error=>{process.stderr.write(JSON.stringify({error:error instanceof Error?error.message:String(error),code:error instanceof WeftError?error.code:'ERROR'})+'\n');process.exitCode=1;});
