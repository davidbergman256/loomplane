import type { StreamView } from './workspace';
import { useState } from 'react';
import { useAuth } from './Auth';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  GitBranch,
  Link2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type { Capsule } from '../../../src/core/types';
import { CapsuleCard, Empty } from './components';
import type { FormKind } from './Forms';
import type { Selection } from './Inspector';
export default function StreamBoard({
  streams,
  selectedId,
  onSelect,
  onForm,
  onRefresh,
  onDrop,
  refreshing,
}: {
  streams: StreamView[];
  selectedId?: string;
  onSelect: (selection: Selection) => void;
  onForm: (form: FormKind) => void;
  onRefresh: (state: StreamView) => void;
  onDrop: (streamId: string, capsuleId: string) => void;
  refreshing: string | null;
}) {
  const { canWrite } = useAuth();
  return (
    <div className={`stream-board ${streams.length === 1 ? 'single-stream' : ''}`}>
      {streams.map((state, i) => (
        <StreamLane
          key={state.stream.id}
          state={state}
          index={i}
          selectedId={selectedId}
          onSelect={onSelect}
          onForm={onForm}
          onRefresh={() => onRefresh(state)}
          onDrop={(id) => onDrop(state.stream.id, id)}
          refreshing={refreshing === state.stream.id}
        />
      ))}
      <button
        disabled={!canWrite}
        className="add-stream-lane"
        onClick={() => onForm({ type: 'stream' })}
      >
        <span>
          <Plus size={20} />
        </span>
        New stream
      </button>
    </div>
  );
}
function StreamLane({
  state,
  index,
  selectedId,
  onSelect,
  onForm,
  onRefresh,
  onDrop,
  refreshing,
}: {
  state: StreamView;
  index: number;
  selectedId?: string;
  onSelect: (selection: Selection) => void;
  onForm: (form: FormKind) => void;
  onRefresh: () => void;
  onDrop: (id: string) => void;
  refreshing: boolean;
}) {
  const { canWrite } = useAuth();
  const [over, setOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { stream, owned, mounts, latestPacket, drift, conflicts } = state;
  const stale = drift.filter((d) => !d.pinned);
  const pinnedUpdates = drift.filter((d) => d.pinned);
  const derivedStale = stale.some((d) => d.reason === 'dependency');
  const activeOwned = owned.filter((c) => c.status === 'active');
  const colors = ['#7475b9', '#328b85', '#cb816a'];
  const color = stream.color || colors[index % colors.length];
  return (
    <section
      className={`stream-lane ${over ? 'drag-over' : ''}`}
      style={{ '--stream-color': color } as React.CSSProperties}
      onDragOver={(event) => {
        if (canWrite && event.dataTransfer.types.includes('application/loomplane-capsule')) {
          event.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const id = event.dataTransfer.getData('application/loomplane-capsule');
        if (id && canWrite) onDrop(id);
      }}
    >
      <header className="lane-heading">
        <div className="lane-topline">
          <span className="lane-avatar">{stream.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <h2>{stream.name}</h2>
            <span>{stream.agent || 'Unassigned agent'}</span>
          </div>
          <button
            disabled={!canWrite}
            className="icon-button"
            aria-label={`Publish to ${stream.name}`}
            onClick={() => onForm({ type: 'capsule', streamId: stream.id })}
          >
            <Plus size={17} />
          </button>
        </div>
        {stream.branch && (
          <div className="branch-label">
            <GitBranch size={12} />
            <span>{stream.branch}</span>
          </div>
        )}
        <div className="lane-status">
          {stale.length ? (
            <span className="drift-status">
              <span />
              {stale.length} context change{stale.length === 1 ? '' : 's'}
            </span>
          ) : latestPacket ? (
            <span className="fresh-status">
              <Check size={12} />
              Context current
            </span>
          ) : (
            <span className="neutral-status">Ready to compile</span>
          )}
          <span>{activeOwned.length + mounts.length} capsules</span>
        </div>
      </header>
      {stale.length > 0 && (
        <div className="drift-alert">
          <div>
            <AlertTriangle size={14} />
            <strong>
              {derivedStale ? 'Derived context needs review' : 'Shared context changed'}
            </strong>
          </div>
          {derivedStale && (
            <p>
              Review the upstream change and revise the derived capsule. Recompiling alone will not
              clear this drift.
            </p>
          )}
          <p>
            {stale[0].title}
            {stale.length > 1 ? ` + ${stale.length - 1} more` : ''}
          </p>
          <button className="text-button" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Hide changes' : 'Inspect changes'}
            <ChevronDown size={12} />
          </button>
          {expanded && (
            <ul className="drift-list">
              {drift.map((change, i) => (
                <li key={`${change.capsuleId}-${i}`}>
                  <button onClick={() => onSelect({ type: 'capsule', id: change.capsuleId })}>
                    {change.title}
                  </button>
                  <span>
                    {change.dependency
                      ? `Derived from ${change.dependency.title} v${change.dependency.expectedVersion}; now v${change.dependency.currentVersion}`
                      : `${change.reason} · v${change.compiledVersion} → v${change.currentVersion}`}
                    {change.pinned ? ' · pinned' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button className="refresh-button" disabled={refreshing || !canWrite} onClick={onRefresh}>
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Compiling…' : derivedStale ? 'Recompile packet' : 'Refresh packet'}
          </button>
        </div>
      )}
      {pinnedUpdates.length > 0 && !stale.length && (
        <div className="pinned-notice">
          <Link2 size={13} />
          {pinnedUpdates.length} pinned source{pinnedUpdates.length > 1 ? 's have' : ' has'} newer
          context
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="conflict-notice">
          <AlertTriangle size={13} />
          {conflicts.length} explicit conflict{conflicts.length === 1 ? '' : 's'}
          {conflicts.map((c) => (
            <p key={c.key}>
              {c.key}: {c.titles.join(' / ')}
            </p>
          ))}
        </div>
      )}
      <div className="lane-content">
        <div className="lane-section-title">
          <span>Published here</span>
          <span>{activeOwned.length}</span>
        </div>
        {activeOwned.length ? (
          activeOwned.map((c) => (
            <CapsuleCard
              key={c.id}
              capsule={c}
              selected={selectedId === c.id}
              onSelect={() => onSelect({ type: 'capsule', id: c.id })}
            />
          ))
        ) : (
          <div className="lane-empty">
            Give this stream its first piece of context.
            <button
              disabled={!canWrite}
              onClick={() => onForm({ type: 'capsule', streamId: stream.id })}
            >
              Publish a capsule
              <Plus size={12} />
            </button>
          </div>
        )}
        <div className="lane-section-title connected">
          <span>
            <Link2 size={12} />
            Shared context
          </span>
          <button
            disabled={!canWrite}
            className="icon-button"
            aria-label={`Connect context to ${stream.name}`}
            onClick={() => onForm({ type: 'mount', streamId: stream.id })}
          >
            <Plus size={13} />
          </button>
        </div>
        {mounts.map((m) => (
          <CapsuleCard
            key={m.id}
            capsule={m.capsule}
            mounted={m.mode === 'pinned' ? `Pinned · v${m.pinnedVersion}` : 'Following latest'}
            selected={selectedId === m.capsuleId}
            onSelect={() => onSelect({ type: 'capsule', id: m.capsuleId })}
          />
        ))}
        <button
          disabled={!canWrite}
          className="connect-drop"
          onClick={() => onForm({ type: 'mount', streamId: stream.id })}
        >
          <Link2 size={13} />
          {over ? 'Release to connect' : 'Connect or drop a capsule'}
        </button>
      </div>
      <footer className="lane-footer">
        {latestPacket && (
          <button
            className="packet-summary"
            onClick={() => onSelect({ type: 'packetRef', id: latestPacket.id })}
          >
            <FileText size={14} />
            <span>
              Latest packet
              <small>
                {latestPacket.capsuleCount} revisions · ~
                {latestPacket.estimatedTokens.toLocaleString()} tokens
              </small>
            </span>
            <ArrowRight size={14} />
          </button>
        )}
        <button
          disabled={!canWrite}
          className="compile-button"
          onClick={() => onForm({ type: 'compile', streamId: stream.id })}
        >
          {latestPacket ? 'Compile new packet' : 'Compile context'}
          <ArrowRight size={14} />
        </button>
      </footer>
    </section>
  );
}
export function CapsuleLibrary({
  capsules,
  selectedId,
  onSelect,
  onForm,
}: {
  capsules: Capsule[];
  selectedId?: string;
  onSelect: (selection: Selection) => void;
  onForm: (form: FormKind) => void;
}) {
  const { canWrite } = useAuth();
  const [kind, setKind] = useState('all');
  const filtered = capsules.filter((c) => kind === 'all' || c.kind === kind);
  return (
    <>
      <div className="library-toolbar">
        <div className="filter-pills">
          {['all', 'decision', 'fact', 'constraint', 'question', 'artifact'].map((k) => (
            <button className={kind === k ? 'active' : ''} key={k} onClick={() => setKind(k)}>
              {k === 'all' ? 'All capsules' : `${k.charAt(0).toUpperCase()}${k.slice(1)}s`}
            </button>
          ))}
        </div>
        <span>
          {filtered.length} capsule{filtered.length === 1 ? '' : 's'}
        </span>
      </div>
      {filtered.length ? (
        <div className="library-grid">
          {filtered.map((c) => (
            <CapsuleCard
              key={c.id}
              capsule={c}
              selected={selectedId === c.id}
              onSelect={() => onSelect({ type: 'capsule', id: c.id })}
            />
          ))}
        </div>
      ) : (
        <Empty title="No capsules here yet.">
          <p>Publish a decision, fact, or constraint that other streams can use.</p>
          <button
            disabled={!canWrite}
            className="button primary"
            onClick={() => onForm({ type: 'capsule' })}
          >
            <Plus size={15} />
            Publish capsule
          </button>
        </Empty>
      )}
    </>
  );
}
