import { useEffect, useState } from 'react';
import { useAuth } from './Auth';
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  CheckCheck,
  Copy,
  FileText,
  GitBranch,
  History,
  Link2,
  Pencil,
  Unlink,
  X,
} from 'lucide-react';
import type { Capsule, Packet, Revision, Snapshot } from '../../../src/core/types';
import { api, dateLabel, download } from './api';
import { ExternalEvidence, Kind } from './components';
import type { FormKind } from './Forms';
import { ImpactPanel, PacketPreflight } from './ContextHealth';
export type Selection =
  { type: 'capsule'; id: string; version?: number } | { type: 'packet'; packet: Packet } | null;
export default function Inspector({
  selection,
  snapshot,
  onClose,
  onForm,
  onError,
  onChange,
  onSelect,
}: {
  selection: Selection;
  snapshot: Snapshot;
  onClose: () => void;
  onForm: (form: FormKind) => void;
  onError: (message: string) => void;
  onChange: () => void;
  onSelect: (selection: Selection) => void;
}) {
  const { canWrite } = useAuth();
  const [tab, setTab] = useState('context');
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const capsule =
    selection?.type === 'capsule'
      ? snapshot.capsules.find((c) => c.id === selection.id)
      : undefined;
  const packet = selection?.type === 'packet' ? selection.packet : undefined;
  useEffect(() => {
    setTab('context');
    setVersion(selection?.type === 'capsule' ? (selection.version ?? null) : null);
    setRevisions([]);
  }, [
    selection?.type,
    selection?.type === 'capsule' ? selection.version : undefined,
    capsule?.id,
    packet?.id,
  ]);
  useEffect(() => {
    if (!capsule) return;
    let active = true;
    api<{ capsule: Capsule; revisions: Revision[] }>(`/capsules/${capsule.id}`)
      .then((result) => {
        if (active) setRevisions(result.revisions);
      })
      .catch((cause) => onError(cause.message));
    return () => {
      active = false;
    };
  }, [capsule?.id, capsule?.version]);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onError('Clipboard unavailable. Use Export to save the context.');
    }
  }
  const viewedRevision = revisions.find((r) => r.version === version);
  const shown = viewedRevision ?? capsule;
  const prior =
    shown && 'version' in shown
      ? revisions.find((r) => r.version === shown.version - 1)
      : undefined;
  if (!selection)
    return (
      <aside className="inspector inspector-idle">
        <div className="inspector-head">
          <span>Context inspector</span>
          <FileText size={16} />
        </div>
        <div className="idle-art" aria-hidden="true">
          <div />
          <div />
          <div />
          <span>
            <Link2 size={24} />
          </span>
        </div>
        <h3>The context behind the work.</h3>
        <p>
          Select a capsule to trace its evidence, follow its revisions, and see where it is used.
        </p>
        <div className="inspector-tip">
          <GitBranch size={17} />
          <span>
            Independent streams.
            <br />
            Shared understanding.
          </span>
        </div>
        <div className="local-note">
          <span className="status-dot" />
          Local workspace<span>Nothing leaves this server.</span>
        </div>
      </aside>
    );
  return (
    <aside className="inspector open">
      <div className="inspector-head">
        <span>{packet ? 'Compiled context' : 'Context inspector'}</span>
        <button className="icon-button" aria-label="Close inspector" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      {capsule && shown && (
        <>
          <div className="inspector-title">
            <div className="card-meta">
              <Kind kind={capsule.kind} />
              <span className="version">
                v{shown.version}
                {viewedRevision && viewedRevision.version !== capsule.version
                  ? ' · historical'
                  : ' · latest'}
              </span>
            </div>
            <h2>{shown.title}</h2>
            <p>
              By {shown.author} <span>•</span>{' '}
              {dateLabel('updatedAt' in shown ? shown.updatedAt : shown.createdAt)}
            </p>
            <div className="inspector-actions">
              <button
                disabled={!canWrite}
                className="button secondary"
                onClick={() => onForm({ type: 'capsule', capsule })}
              >
                <Pencil size={14} />
                Revise
              </button>
              <button
                className="button secondary"
                disabled={!canWrite || !snapshot.streams.length || capsule.status !== 'active'}
                onClick={() => onForm({ type: 'mount', capsuleId: capsule.id })}
              >
                <Link2 size={14} />
                Connect
              </button>
            </div>
          </div>
          <div className="inspector-tabs">
            <button className={tab === 'context' ? 'active' : ''} onClick={() => setTab('context')}>
              Context
            </button>
            <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
              <History size={13} />
              History <span>{revisions.length}</span>
            </button>
            <button className={tab === 'impact' ? 'active' : ''} onClick={() => setTab('impact')}>
              Impact
            </button>
          </div>
          <div className="inspector-body">
            {tab === 'impact' ? (
              <ImpactPanel capsuleId={capsule.id} snapshot={snapshot} onSelect={onSelect} />
            ) : tab === 'context' ? (
              <>
                {capsule.status !== 'active' && (
                  <div className="notice warning">This capsule is {capsule.status}.</div>
                )}
                <div className="prose">{shown.body}</div>
                {shown.tags.length > 0 && (
                  <div className="tag-list">
                    {shown.tags.map((tag, i) => (
                      <span key={`${tag}-${i}`}>{tag}</span>
                    ))}
                  </div>
                )}
                {(shown.dependencies?.length ?? 0) > 0 && (
                  <section className="inspector-section">
                    <h4>
                      <GitBranch size={14} />
                      Derived from <span>{shown.dependencies!.length}</span>
                    </h4>
                    {shown.dependencies!.map((dependency) => {
                      const source = snapshot.capsules.find((c) => c.id === dependency.capsuleId);
                      const changed =
                        source &&
                        (source.version !== dependency.version || source.status !== 'active');
                      return (
                        <button
                          className={`dependency-link ${changed ? 'needs-review' : ''}`}
                          key={dependency.capsuleId}
                          onClick={() =>
                            onSelect({
                              type: 'capsule',
                              id: dependency.capsuleId,
                              version: dependency.version,
                            })
                          }
                        >
                          <strong>{source?.title ?? dependency.capsuleId}</strong>
                          <span>
                            Reviewed v{dependency.version}
                            {changed
                              ? ` · now v${source.version}${source.status !== 'active' ? ` (${source.status})` : ''}`
                              : ' · current'}
                          </span>
                        </button>
                      );
                    })}
                    <p className="muted" style={{ marginTop: 12 }}>
                      Upstream changes require review of this claim. Recompiling alone does not
                      validate it.
                    </p>
                  </section>
                )}
                <section className="inspector-section">
                  <h4>
                    <Link2 size={14} />
                    Evidence <span>{shown.evidence.length}</span>
                  </h4>
                  {shown.evidence.length ? (
                    shown.evidence.map((evidence, i) => (
                      <div className="evidence" key={i}>
                        <ExternalEvidence uri={evidence.uri} label={evidence.label} />
                        {evidence.excerpt && <blockquote>{evidence.excerpt}</blockquote>}
                      </div>
                    ))
                  ) : (
                    <p className="muted">No source attached to this revision.</p>
                  )}
                </section>
                <section className="inspector-section">
                  <h4>
                    <GitBranch size={14} />
                    Used in streams
                  </h4>
                  {snapshot.streams
                    .filter(
                      (s) =>
                        s.owned.some((c) => c.id === capsule.id) ||
                        s.mounts.some((m) => m.capsuleId === capsule.id),
                    )
                    .map((s) => {
                      const mount = s.mounts.find((m) => m.capsuleId === capsule.id);
                      return (
                        <div className="usage-row" key={s.stream.id}>
                          <span className="stream-dot" style={{ background: s.stream.color }} />
                          <div>
                            <strong>{s.stream.name}</strong>
                            <span>
                              {mount
                                ? mount.mode === 'pinned'
                                  ? `Pinned to v${mount.pinnedVersion}`
                                  : 'Following latest'
                                : 'Source stream'}
                            </span>
                          </div>
                          {mount && (
                            <button
                              disabled={!canWrite}
                              className="icon-button"
                              aria-label={`Disconnect from ${s.stream.name}`}
                              onClick={async () => {
                                try {
                                  await api(`/mounts/${mount.id}`, undefined, 'DELETE');
                                  onChange();
                                } catch (cause) {
                                  onError((cause as Error).message);
                                }
                              }}
                            >
                              <Unlink size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                </section>
                <section className="inspector-section metadata">
                  <h4>Details</h4>
                  <dl>
                    <dt>Semantic key</dt>
                    <dd>{capsule.key || 'Unspecified'}</dd>
                    <dt>Priority</dt>
                    <dd>{shown.priority}</dd>
                    <dt>Status</dt>
                    <dd>{capsule.status}</dd>
                    <dt>Capsule ID</dt>
                    <dd className="mono">{capsule.id}</dd>
                  </dl>
                </section>
              </>
            ) : (
              <>
                <p className="muted history-explainer">
                  Every revision is immutable. Select a version to inspect the change.
                </p>
                <div className="revision-list">
                  {revisions.map((revision) => (
                    <button
                      className={(version ?? capsule.version) === revision.version ? 'active' : ''}
                      key={revision.version}
                      onClick={() => setVersion(revision.version)}
                    >
                      <span className="revision-point" />
                      <div>
                        <strong>
                          Version {revision.version}
                          {revision.version === capsule.version && <small>Latest</small>}
                        </strong>
                        <p>{revision.changeNote || 'Initial publication'}</p>
                        <span>
                          {revision.author} · {dateLabel(revision.createdAt)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <section className="inspector-section">
                  <h4>Revision {shown.version}</h4>
                  <div className="prose">{shown.body}</div>
                  {prior && (
                    <details className="revision-diff" open>
                      <summary>Changes from v{prior.version}</summary>
                      {prior.body === shown.body ? (
                        <p className="muted">
                          Context text unchanged. Metadata or evidence changed.
                        </p>
                      ) : (
                        <>
                          <div className="diff removed">
                            <span>Previous</span>
                            {prior.body}
                          </div>
                          <div className="diff added">
                            <span>Revised</span>
                            {shown.body}
                          </div>
                        </>
                      )}
                    </details>
                  )}
                </section>
              </>
            )}
          </div>
          <div className="inspector-footer">
            <button className="text-button" onClick={() => copy(shown.body)}>
              {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
              {copied ? 'Copied' : 'Copy context'}
            </button>
            <button
              className="text-button"
              onClick={() =>
                download(
                  `${capsule.id}-v${shown.version}.md`,
                  `# ${shown.title}\n\n${shown.body}\n`,
                )
              }
            >
              <ArrowDownToLine size={14} />
              Export
            </button>
          </div>
        </>
      )}
      {packet && (
        <PacketInspector
          packet={packet}
          copied={copied}
          onCopy={() => copy(packet.text)}
          onSelect={onSelect}
          snapshot={snapshot}
          onChange={onChange}
        />
      )}
    </aside>
  );
}
function PacketInspector({
  packet,
  copied,
  onCopy,
  onSelect,
  snapshot,
  onChange,
}: {
  packet: Packet;
  copied: boolean;
  onCopy: () => void;
  onSelect: (selection: Selection) => void;
  snapshot: Snapshot;
  onChange: () => void;
}) {
  const [tab, setTab] = useState('manifest');
  return (
    <>
      <div className="inspector-title">
        <div className="packet-label">
          <CheckCheck size={15} />
          Reproducible context
        </div>
        <h2>Your working packet.</h2>
        <p>Compiled {dateLabel(packet.createdAt)}</p>
        <div className="budget-stat">
          <strong>
            {packet.estimatedTokens.toLocaleString()}
            <span> / {packet.budget.toLocaleString()}</span>
          </strong>
          <span>estimated tokens</span>
        </div>
        <div className="budget-track">
          <span
            style={{ width: `${Math.min(100, (packet.estimatedTokens / packet.budget) * 100)}%` }}
          />
        </div>
        <p className="estimate-note">
          Estimate includes the entire packet, not a provider billing count.
        </p>
      </div>
      <div className="inspector-tabs">
        <button className={tab === 'manifest' ? 'active' : ''} onClick={() => setTab('manifest')}>
          Manifest <span>{packet.manifest.length}</span>
        </button>
        <button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}>
          Packet text
        </button>
      </div>
      <div className="inspector-body">
        <PacketPreflight
          key={packet.id}
          packet={packet}
          snapshot={snapshot}
          onSelect={onSelect}
          onChange={onChange}
        />
        {packet.task && (
          <div className="packet-task">
            <span>Task</span>
            <p>{packet.task}</p>
          </div>
        )}
        {tab === 'text' ? (
          <pre className="packet-text">{packet.text}</pre>
        ) : (
          <>
            <p className="muted">The exact revisions included in this packet.</p>
            <div className="manifest-list">
              {packet.manifest.map((item) => (
                <button
                  key={item.capsuleId}
                  onClick={() =>
                    onSelect({ type: 'capsule', id: item.capsuleId, version: item.version })
                  }
                >
                  <span className="manifest-check">
                    <Check size={12} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {item.mode} · ~{item.estimatedTokens} tokens
                    </span>
                  </div>
                  <span className="version">v{item.version}</span>
                </button>
              ))}
            </div>
            {packet.omitted.length > 0 && (
              <section className="inspector-section">
                <h4>
                  <AlertCircle size={14} />
                  Omitted <span>{packet.omitted.length}</span>
                </h4>
                {packet.omitted.map((item) => (
                  <div className="omission" key={item.capsuleId}>
                    <strong>{item.title}</strong>
                    <p>{item.reason}</p>
                  </div>
                ))}
              </section>
            )}
            {packet.conflicts.length > 0 && (
              <section className="inspector-section">
                <h4>
                  <AlertCircle size={14} />
                  Explicit conflicts
                </h4>
                {packet.conflicts.map((conflict) => (
                  <div className="notice warning" key={conflict.key}>
                    <strong>{conflict.key}</strong>
                    <p>{conflict.reason}</p>
                    <span>{conflict.titles.join(' / ')}</span>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
      <div className="inspector-footer">
        <button className="text-button" onClick={onCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy packet'}
        </button>
        <button
          className="text-button"
          onClick={() => download(`loomplane-packet-${packet.id}.md`, packet.text)}
        >
          <ArrowDownToLine size={14} />
          Export
        </button>
      </div>
    </>
  );
}
