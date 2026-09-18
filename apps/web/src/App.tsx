import { hydrateWorkspace } from './workspace';
import type { WorkspaceView, StreamView } from './workspace';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  GitBranch,
  Layers3,
  Link2,
  Menu,
  Plus,
  Search,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import type { Packet, SearchHit, WorkspaceSnapshot } from '../../../src/core/types';
import { api, dateLabel, download, subscribeChanges } from './api';
import { useAuth } from './Auth';
import { Brand, CapsuleCard, Empty } from './components';
import Forms from './Forms';
import type { FormKind } from './Forms';
import Inspector from './Inspector';
import type { Selection } from './Inspector';
import StreamBoard, { CapsuleLibrary } from './StreamBoard';
type View = 'streams' | 'library' | 'events' | 'guide';
export default function App() {
  const auth = useAuth();
  const [snapshot, setSnapshot] = useState<WorkspaceView | null>(null);
  const [projectId, setProjectId] = useState('');
  const [view, setView] = useState<View>('streams');
  const [streamFilter, setStreamFilter] = useState<string | null>(null);
  const [selection, updateSelection] = useState<Selection>(null);
  const [form, setForm] = useState<FormKind | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [connection, setConnection] = useState<'live' | 'reconnecting'>('live');
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const fetchSequence = useRef(0);
  const selectionSequence = useRef(0);
  const projectSequence = useRef(0);
  const setSelection = useCallback((next: Selection) => {
    selectionSequence.current += 1;
    updateSelection(next);
  }, []);
  const refresh = useCallback(
    async (id?: string) => {
      const projectSeq = projectSequence.current;
      const seq = ++fetchSequence.current;
      try {
        const data = await api<WorkspaceSnapshot>(
          `/workspace${id || projectId ? `?projectId=${encodeURIComponent(id || projectId)}` : ''}`,
        );
        if (seq === fetchSequence.current && projectSeq === projectSequence.current) {
          setSnapshot(hydrateWorkspace(data));
          setError('');
        }
      } catch (cause) {
        if (seq === fetchSequence.current && projectSeq === projectSequence.current)
          setError((cause as Error).message);
      } finally {
        if (seq === fetchSequence.current && projectSeq === projectSequence.current)
          setLoading(false);
      }
    },
    [projectId],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = subscribeChanges(
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 180);
      },
      (connected) => setConnection(connected ? 'live' : 'reconnecting'),
    );
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [refresh]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setQuery('');
        setMobileNav(false);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  useEffect(() => {
    if (!query.trim() || !snapshot?.project) {
      setHits([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = setTimeout(
      () =>
        api<SearchHit[]>(
          `/search?projectId=${encodeURIComponent(snapshot.project!.id)}&q=${encodeURIComponent(query)}`,
        )
          .then((data) => {
            if (active) {
              setHits(data);
              setSearching(false);
            }
          })
          .catch((cause) => {
            if (active) {
              setError(cause.message);
              setSearching(false);
            }
          }),
      220,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, snapshot?.project?.id, snapshot?.capsules]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  function switchProject(id: string) {
    projectSequence.current += 1;
    fetchSequence.current += 1;
    setSnapshot(null);
    setLoading(true);
    setForm(null);
    setProjectId(id);
    setSelection(null);
    setStreamFilter(null);
    setQuery('');
    setMobileNav(false);
  }
  function navigate(next: View, streamId: string | null = null) {
    setView(next);
    setStreamFilter(streamId);
    setQuery('');
    setMobileNav(false);
  }
  async function demo() {
    setDemoBusy(true);
    try {
      const result = await api<{ projectId: string }>('/demo', {});
      switchProject(result.projectId);
      await refresh(result.projectId);
      setNotice('Synthetic demo loaded. Try refreshing a stream with changed context.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setDemoBusy(false);
    }
  }
  async function refreshPacket(state: StreamView) {
    const projectSeq = projectSequence.current;
    const selectionSeq = selectionSequence.current;
    setRefreshing(state.stream.id);
    try {
      const packet = await api<Packet>('/compile', {
        streamId: state.stream.id,
        task: state.latestPacket?.task ?? '',
        budget: state.latestPacket?.budget ?? 4000,
      });
      if (projectSeq !== projectSequence.current) return;
      if (selectionSeq === selectionSequence.current) setSelection({ type: 'packet', packet });
      await refresh();
      setNotice('New packet compiled. Review its preflight before use.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setRefreshing(null);
    }
  }
  async function connectDrop(streamId: string, capsuleId: string) {
    try {
      await api('/mounts', { streamId, capsuleId, mode: 'live' });
      await refresh();
      setNotice('Capsule connected. Compile a packet to include it.');
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function exportProject() {
    if (!snapshot?.project) return;
    try {
      const result = await api(`/export?projectId=${encodeURIComponent(snapshot.project.id)}`);
      download(
        `loomplane-${snapshot.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`,
        JSON.stringify(result, null, 2),
        'application/json',
      );
      setNotice('Project export saved.');
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  const renderedProjectSequence = projectSequence.current;
  const project = snapshot?.project;
  const filteredStreams =
    snapshot?.streams.filter((s) => !streamFilter || s.stream.id === streamFilter) ?? [];
  const focusedStream = streamFilter
    ? snapshot?.streams.find((s) => s.stream.id === streamFilter)?.stream
    : undefined;
  const selectedId = selection?.type === 'capsule' ? selection.id : undefined;
  const synthetic = !!project && /synthetic|demo/i.test(`${project.name} ${project.description}`);
  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <span className="preview-tag">{auth.required ? 'shared' : 'local'}</span>
        </div>
        <div className="project-switch">
          <span className="project-avatar">{project?.name.slice(0, 1).toUpperCase() ?? 'W'}</span>
          <div>
            <span>Workspace</span>
            <select
              aria-label="Select project"
              value={project?.id ?? ''}
              onChange={(e) => switchProject(e.target.value)}
            >
              {!project && <option value="">Your projects</option>}
              {snapshot?.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={14} />
        </div>
        <button
          className="new-project"
          disabled={!auth.canAdmin}
          title={!auth.canAdmin ? 'Project creation requires administrator access' : undefined}
          onClick={() => setForm({ type: 'project' })}
        >
          <Plus size={13} />
          New project
        </button>
        <nav className="main-nav">
          <button
            className={view === 'streams' && !streamFilter ? 'active' : ''}
            onClick={() => navigate('streams')}
          >
            <Layers3 size={17} />
            Workbench{snapshot && <span>{snapshot.stats.streams}</span>}
          </button>
          <button
            className={view === 'library' ? 'active' : ''}
            onClick={() => navigate('library')}
          >
            <Boxes size={17} />
            Capsule library{snapshot && <span>{snapshot.stats.capsules}</span>}
          </button>
          <button className={view === 'events' ? 'active' : ''} onClick={() => navigate('events')}>
            <Activity size={17} />
            Activity
          </button>
        </nav>
        <div className="sidebar-section-title">
          <span>Parallel streams</span>
          <button
            className="icon-button"
            aria-label="Create stream"
            disabled={!project || !auth.canWrite}
            onClick={() => setForm({ type: 'stream' })}
          >
            <Plus size={15} />
          </button>
        </div>
        <nav className="stream-nav">
          {snapshot?.streams.map((s) => (
            <button
              className={streamFilter === s.stream.id && view === 'streams' ? 'active' : ''}
              key={s.stream.id}
              onClick={() => navigate('streams', s.stream.id)}
            >
              <span className="stream-dot" style={{ background: s.stream.color }} />
              <span>{s.stream.name}</span>
              {s.drift.some((d) => !d.pinned) && (
                <span className="sidebar-drift" aria-label="Context changed" />
              )}
            </button>
          ))}
          {!snapshot?.streams.length && (
            <p>
              Your independent lines
              <br />
              of work will appear here.
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-health">
            <span className={`status-dot ${connection === 'reconnecting' ? 'offline' : ''}`} />
            <div>
              {connection === 'live'
                ? auth.required
                  ? 'Connected context server'
                  : 'Local context server'
                : 'Reconnecting to server'}
              <span>Versioned. Traceable. Yours.</span>
            </div>
          </div>
          <button
            className={view === 'guide' ? 'guide-link active' : 'guide-link'}
            onClick={() => navigate('guide')}
          >
            <CircleHelp size={16} />
            How Loomplane works
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footnote">
            <span>{auth.required ? `${auth.role} access` : 'Open source'}</span>
            {auth.required ? <button onClick={auth.logout}>Sign out</button> : <span>Preview</span>}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={19} />
            </button>
            <span>{project?.name ?? 'Your workspace'}</span>
            <span className="breadcrumb-slash">/</span>
            <strong>
              {view === 'streams'
                ? (focusedStream?.name ?? 'Workbench')
                : view === 'library'
                  ? 'Capsule library'
                  : view === 'events'
                    ? 'Activity'
                    : 'Field guide'}
            </strong>
            {synthetic && <span className="synthetic-badge">Synthetic demo</span>}
          </div>
          <div className="global-search">
            <Search size={15} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search context…"
              aria-label="Search project context"
              disabled={!project}
            />
            {query ? (
              <button aria-label="Clear search" onClick={() => setQuery('')}>
                <X size={13} />
              </button>
            ) : (
              <kbd>⌘ K</kbd>
            )}
          </div>
          <button
            className="icon-button top-export"
            title="Export project"
            aria-label="Export project"
            disabled={!project}
            onClick={() => void exportProject()}
          >
            <ArrowDownToLine size={17} />
          </button>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => void refresh()}>Retry</button>
            <button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={15} />
            </button>
          </div>
        )}
        <div className="workspace-body">
          <main className={`workspace ${view === 'guide' ? 'guide-workspace' : ''}`}>
            {loading && !snapshot ? (
              <div className="loading-state">
                <Brand />
                <p>Opening your context workspace…</p>
              </div>
            ) : !project ? (
              <Welcome
                busy={demoBusy}
                onDemo={() => void demo()}
                onCreate={() => setForm({ type: 'project' })}
              />
            ) : query.trim() ? (
              <>
                <PageHeading
                  title="Find the context you need."
                  description={`Searching capsules in ${project.name}`}
                />
                <div className="search-summary">
                  {searching
                    ? 'Searching…'
                    : `${hits.length} result${hits.length === 1 ? '' : 's'} for “${query}”`}
                </div>
                <div className="library-grid">
                  {hits.map((hit) => (
                    <CapsuleCard
                      key={hit.capsule.id}
                      capsule={hit.capsule}
                      selected={selectedId === hit.capsule.id}
                      onSelect={() => setSelection({ type: 'capsule', id: hit.capsule.id })}
                    />
                  ))}
                </div>
                {!searching && !hits.length && (
                  <Empty title="No matching context.">
                    <p>Try a title, a tag, or a phrase from a capsule.</p>
                  </Empty>
                )}
              </>
            ) : view === 'guide' ? (
              <Guide />
            ) : (
              <>
                <PageHeading
                  title={
                    view === 'streams'
                      ? (focusedStream?.name ?? 'Many streams. One understanding.')
                      : view === 'library'
                        ? 'Knowledge that travels.'
                        : 'A record of what changed.'
                  }
                  description={
                    view === 'streams'
                      ? focusedStream?.description ||
                        'Independent work, connected by shared and versioned context.'
                      : view === 'library'
                        ? 'Decisions, facts, and constraints. Addressable across your project.'
                        : 'The local append-only application log. Every change has a source.'
                  }
                  action={
                    view === 'events' ? (
                      <button className="button secondary" onClick={() => void exportProject()}>
                        <ArrowDownToLine size={14} />
                        Export project
                      </button>
                    ) : (
                      <button
                        className="button primary"
                        disabled={!auth.canWrite}
                        onClick={() =>
                          setForm({
                            type: 'capsule',
                            ...(streamFilter ? { streamId: streamFilter } : {}),
                          })
                        }
                      >
                        <Plus size={15} />
                        Publish capsule
                      </button>
                    )
                  }
                />
                {view === 'streams' && (
                  <>
                    <div className="workbench-meta">
                      <div>
                        <span>
                          <span className="meta-dots">
                            <i />
                            <i />
                            <i />
                          </span>
                          {snapshot!.stats.streams} streams
                        </span>
                        <span>
                          <Link2 size={13} />
                          {snapshot!.stats.mounts} connections
                        </span>
                        <span>
                          <FileText size={13} />
                          {snapshot!.stats.packets} packets
                        </span>
                      </div>
                      <span
                        className={snapshot!.stats.staleStreams ? 'changes-pill' : 'current-pill'}
                      >
                        {snapshot!.stats.staleStreams
                          ? `${snapshot!.stats.staleStreams} streams need a refresh`
                          : 'Context in sync'}
                        <span className="status-dot" />
                      </span>
                    </div>
                    {!filteredStreams.length ? (
                      <Empty title="Make room for parallel work.">
                        <p>
                          Create a stream for each agent or independent task. Shared capsules keep
                          the work connected.
                        </p>
                        <button
                          className="button primary"
                          disabled={!auth.canWrite}
                          onClick={() => setForm({ type: 'stream' })}
                        >
                          <Plus size={15} />
                          Create your first stream
                        </button>
                      </Empty>
                    ) : (
                      <StreamBoard
                        streams={filteredStreams}
                        selectedId={selectedId}
                        onSelect={setSelection}
                        onForm={setForm}
                        onRefresh={(state) => void refreshPacket(state)}
                        onDrop={(streamId, capsuleId) => void connectDrop(streamId, capsuleId)}
                        refreshing={refreshing}
                      />
                    )}
                    {snapshot!.capsules.some((c) => !c.streamId) && !streamFilter && (
                      <section className="commons-section">
                        <div className="commons-heading">
                          <div>
                            <Link2 size={16} />
                            <h2>Project commons</h2>
                            <span>Context available to every stream</span>
                          </div>
                          <button
                            className="text-button"
                            disabled={!auth.canWrite}
                            onClick={() => setForm({ type: 'capsule' })}
                          >
                            <Plus size={13} />
                            Add context
                          </button>
                        </div>
                        <div className="commons-grid">
                          {snapshot!.capsules
                            .filter((c) => !c.streamId)
                            .map((c) => (
                              <CapsuleCard
                                key={c.id}
                                capsule={c}
                                selected={selectedId === c.id}
                                onSelect={() => setSelection({ type: 'capsule', id: c.id })}
                              />
                            ))}
                        </div>
                      </section>
                    )}
                  </>
                )}
                {view === 'library' && (
                  <CapsuleLibrary
                    capsules={snapshot!.capsules}
                    selectedId={selectedId}
                    onSelect={setSelection}
                    onForm={setForm}
                  />
                )}
                {view === 'events' && (
                  <div className="activity-list">
                    {snapshot!.events.length ? (
                      snapshot!.events.map((event) => (
                        <details key={event.id} className="activity-event">
                          <summary>
                            <span className="event-icon">
                              <Activity size={15} />
                            </span>
                            <span>
                              <strong>{event.type.replace(/[._-]/g, ' ')}</strong>
                              <span>
                                {event.actor}{' '}
                                <span className="event-entity">
                                  {snapshot!.capsules.find((c) => c.id === event.entityId)?.title ??
                                    snapshot!.streams.find((s) => s.stream.id === event.entityId)
                                      ?.stream.name ??
                                    event.entityId}
                                </span>
                              </span>
                            </span>
                            <time dateTime={event.createdAt}>{dateLabel(event.createdAt)}</time>
                            <ChevronDown size={14} />
                          </summary>
                          <pre>{JSON.stringify(event.data, null, 2)}</pre>
                        </details>
                      ))
                    ) : (
                      <Empty title="The story starts here.">
                        <p>Create a stream or publish a capsule to record your first event.</p>
                      </Empty>
                    )}
                    <p className="activity-note">
                      Application history is local and append-only. This is not a tamper-proof
                      compliance log.
                    </p>
                  </div>
                )}
              </>
            )}
          </main>
          {project && view !== 'guide' && (
            <Inspector
              selection={selection}
              snapshot={snapshot!}
              onClose={() => setSelection(null)}
              onForm={setForm}
              onError={setError}
              onChange={() => void refresh()}
              onSelect={setSelection}
            />
          )}
        </div>
      </div>
      {form && auth.canWrite && (form.type !== 'project' || auth.canAdmin) && (
        <Forms
          key={JSON.stringify(form)}
          form={form}
          snapshot={
            snapshot ?? {
              projects: [],
              project: null,
              streams: [],
              capsules: [],
              events: [],
              stats: { capsules: 0, streams: 0, packets: 0, staleStreams: 0, mounts: 0 },
            }
          }
          onClose={() => setForm(null)}
          onSaved={(result) => {
            if (renderedProjectSequence !== projectSequence.current) return;
            setForm(null);
            if (result?.projectId) switchProject(result.projectId);
            if (result?.capsule) setSelection({ type: 'capsule', id: result.capsule.id });
            if (result?.packet) setSelection({ type: 'packet', packet: result.packet });
            void refresh(result?.projectId);
            setNotice(
              result?.packet
                ? 'Context packet compiled.'
                : result?.capsule
                  ? 'Capsule published.'
                  : 'Workspace updated.',
            );
          }}
        />
      )}{' '}
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Welcome({
  busy,
  onDemo,
  onCreate,
}: {
  busy: boolean;
  onDemo: () => void;
  onCreate: () => void;
}) {
  const { canAdmin } = useAuth();
  return (
    <div className="welcome">
      <div className="welcome-weave" aria-hidden="true">
        <div />
        <div />
        <div />
        <span>
          <Link2 size={24} />
        </span>
      </div>
      <span className="welcome-intro">A workbench for parallel minds.</span>
      <h1>
        Work independently.
        <br />
        Know together.
      </h1>
      <p>
        Give each agent its own stream of work. Share the decisions that matter. See when context
        changes before the work diverges.
      </p>
      <div className="welcome-actions">
        <button className="button primary" disabled={!canAdmin} onClick={onCreate}>
          Create a project
          <ArrowRight size={15} />
        </button>
        <button className="button secondary" disabled={busy || !canAdmin} onClick={onDemo}>
          <Sparkles size={15} />
          {busy ? 'Loading demo…' : 'Explore a synthetic demo'}
        </button>
      </div>
      <div className="welcome-principles">
        <span>
          <GitBranch size={17} />
          Independent streams
        </span>
        <span>
          <HistoryIcon />
          Immutable revisions
        </span>
        <span>
          <Terminal size={17} />
          No model key needed
        </span>
      </div>
      <p className="welcome-local">
        Local-first. Open source. Your knowledge stays on this server.
        <br />
        The demo is synthetic and loads only when you choose it.
      </p>
    </div>
  );
}
function HistoryIcon() {
  return <Activity size={17} />;
}
function Guide() {
  return (
    <div className="guide">
      <PageHeading
        title="Context is a shared dependency."
        description="Loomplane keeps parallel work independent without letting shared knowledge silently drift."
      />
      <div className="guide-flow">
        {[
          {
            icon: GitBranch,
            title: 'Start streams',
            body: 'One stream for each task or agent. Each has a scope, an author, and optionally a Git branch.',
          },
          {
            icon: Boxes,
            title: 'Publish capsules',
            body: 'Make a fact, decision, or constraint addressable. Attach source evidence and keep revisions immutable.',
          },
          {
            icon: Link2,
            title: 'Connect context',
            body: 'Subscribe other streams to the latest revision, or pin a revision for a reproducible dependency.',
          },
          {
            icon: FileText,
            title: 'Compile & refresh',
            body: 'Build a packet within a token budget. When dependencies change, inspect the drift and compile again.',
          },
        ].map(({ icon: Icon, title, body }) => (
          <article key={title}>
            <Icon size={24} />
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <div className="guide-detail">
        <h2>Your agent keeps its own workflow.</h2>
        <p>
          Loomplane assembles context; it does not run a model or pretend agents are working. Use
          the local CLI or MCP tools to publish knowledge and retrieve packets in your existing
          coding environment.
        </p>
        <pre>
          loomplane demo
          <br />
          loomplane serve
          <br />
          loomplane --help
        </pre>
        <h3>What “in sync” means</h3>
        <p>
          A packet records the exact capsule revisions it used. A latest-revision connection becomes
          stale when the source changes. A pin preserves its version and reports newer source
          context without replacing it.
        </p>
        <h3>Conflicts stay visible</h3>
        <p>
          Capsules with overlapping semantic keys and differing content are reported as explicit
          conflicts. Loomplane does not claim to detect every natural-language contradiction.
        </p>
        <h3>Reproducibility you can take with you</h3>
        <p>
          Export a packet as text or your project as portable JSON. Estimated tokens cover the full
          compiled packet and are not provider billing counts.
        </p>
      </div>
    </div>
  );
}
