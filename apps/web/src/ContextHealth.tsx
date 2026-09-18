import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  GitBranch,
  Play,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  Drift,
  Impact,
  Packet,
  PacketCheck,
  Receipt,
  Snapshot,
} from '../../../src/core/types';
import { api, dateLabel } from './api';
import { useAuth } from './Auth';
import type { Selection } from './Inspector';
export function DriftExplanation({
  drift,
  onSelect,
}: {
  drift: Drift;
  onSelect: (selection: Selection) => void;
}) {
  return (
    <div className="health-drift">
      <button onClick={() => onSelect({ type: 'capsule', id: drift.capsuleId })}>
        {drift.title}
        <ArrowUpRight size={11} />
      </button>
      {drift.dependency ? (
        <p>
          Derived from{' '}
          <button
            onClick={() =>
              onSelect({
                type: 'capsule',
                id: drift.dependency!.capsuleId,
                version: drift.dependency!.expectedVersion,
              })
            }
          >
            {drift.dependency.title} v{drift.dependency.expectedVersion}
          </button>
          . Upstream is now v{drift.dependency.currentVersion}
          {drift.dependency.status !== 'active' ? ` (${drift.dependency.status})` : ''}. Review and
          revise the derived claim.
        </p>
      ) : (
        <p>
          {drift.reason === 'added'
            ? 'New context is not in this packet.'
            : `${drift.reason} · v${drift.compiledVersion} → v${drift.currentVersion}`}
          {drift.pinned ? ' · revision is pinned' : ''}
        </p>
      )}
    </div>
  );
}
export function ImpactPanel({
  capsuleId,
  snapshot,
  onSelect,
}: {
  capsuleId: string;
  snapshot: Snapshot;
  onSelect: (selection: Selection) => void;
}) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    api<Impact>(`/capsules/${capsuleId}/impact`)
      .then((value) => {
        if (active) setImpact(value);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [capsuleId, snapshot.events[0]?.id]);
  if (error) return <p className="form-error">{error}</p>;
  if (!impact) return <p className="muted">Tracing context dependencies…</p>;
  return (
    <div className="impact-panel">
      <p className="muted">
        Follow this capsule through current dependencies and historical packet use.
      </p>
      <section className="inspector-section">
        <h4>
          <GitBranch size={14} />
          Dependent capsules <span>{impact.dependentCapsules.length}</span>
        </h4>
        {impact.dependentCapsules.length ? (
          impact.dependentCapsules.map((c) => (
            <button
              className="impact-capsule"
              key={c.id}
              onClick={() => onSelect({ type: 'capsule', id: c.id })}
            >
              <span>
                {c.title}
                <small>
                  {c.kind} · v{c.version}
                </small>
              </span>
              <ArrowUpRight size={13} />
            </button>
          ))
        ) : (
          <p className="muted">No current claims derive from this capsule.</p>
        )}
      </section>
      <section className="inspector-section">
        <h4>
          Consuming streams <span>{impact.streams.length}</span>
        </h4>
        {impact.streams.map(({ stream, relation, stale }) => (
          <div key={stream.id} className="impact-stream">
            <span className="stream-dot" style={{ background: stream.color }} />
            <div>
              <strong>{stream.name}</strong>
              <span>
                {relation === 'owner'
                  ? 'Source stream'
                  : relation === 'direct'
                    ? 'Direct connection'
                    : 'Transitive dependency'}
              </span>
            </div>
            <span className={stale ? 'impact-stale' : 'impact-current'}>
              {stale ? 'Needs review' : 'Current'}
            </span>
          </div>
        ))}
        {!impact.streams.length && <p className="muted">No consuming streams yet.</p>}
      </section>
      <section className="inspector-section">
        <h4>
          Historical run receipts <span>{impact.receipts.length}</span>
        </h4>
        <p className="muted">
          These runs referenced this capsule through their exact packet revisions.
        </p>
        {impact.receipts.map(({ receipt, check }) => (
          <div className="impact-receipt" key={receipt.id}>
            <div>
              <strong>{receipt.agent}</strong>
              <span>{receipt.status}</span>
            </div>
            <p>
              {dateLabel(receipt.createdAt)} · context{' '}
              {check.ok ? 'current at this check' : 'changed since compilation'}
            </p>
            {receipt.outcome && <p>{receipt.outcome}</p>}
            <button
              className="text-button"
              onClick={async () => {
                try {
                  const packet = await api<Packet>(`/packets/${receipt.packetId}`);
                  onSelect({ type: 'packet', packet });
                } catch (cause) {
                  setError((cause as Error).message);
                }
              }}
            >
              Inspect packet
              <ArrowUpRight size={11} />
            </button>
          </div>
        ))}
        {!impact.receipts.length && (
          <p className="muted" style={{ marginTop: 10 }}>
            No recorded run receipts.
          </p>
        )}
      </section>
      <p className="impact-note">
        A receipt records a caller's report. It does not prove a model read or obeyed the context.
      </p>
    </div>
  );
}
export function PacketPreflight({
  packet,
  snapshot,
  onSelect,
  onChange,
}: {
  packet: Packet;
  snapshot: Snapshot;
  onSelect: (selection: Selection) => void;
  onChange: () => void;
}) {
  const { canWrite } = useAuth();
  const [check, setCheck] = useState<PacketCheck | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [agent, setAgent] = useState(
    snapshot.streams.find((s) => s.stream.id === packet.streamId)?.stream.agent ?? '',
  );
  const [showRuns, setShowRuns] = useState(false);
  const [finishing, setFinishing] = useState<Receipt | null>(null);
  const [outcome, setOutcome] = useState('');
  const [commit, setCommit] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([
      api<PacketCheck>(`/packets/${packet.id}/check`),
      api<Receipt[]>(`/receipts?projectId=${packet.projectId}`),
    ])
      .then(([health, runs]) => {
        if (active) {
          setCheck(health);
          setReceipts(runs.filter((r) => r.packetId === packet.id));
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [packet.id, snapshot.events[0]?.id, tick]);
  async function register() {
    setBusy(true);
    setError('');
    try {
      await api('/receipts', { packetId: packet.id, agent: agent.trim() });
      setShowRegister(false);
      setShowRuns(true);
      setTick((t) => t + 1);
      onChange();
    } catch (cause) {
      setError((cause as Error).message);
      setTick((t) => t + 1);
    } finally {
      setBusy(false);
    }
  }
  async function finish(receipt: Receipt, status: 'completed' | 'abandoned') {
    setBusy(true);
    setError('');
    try {
      await api(`/receipts/${receipt.id}`, { status, outcome, gitCommit: commit }, 'PATCH');
      setFinishing(null);
      setOutcome('');
      setCommit('');
      setTick((t) => t + 1);
      onChange();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const dependencyDrift = check?.drift.some((d) => d.reason === 'dependency');
  return (
    <div className="packet-preflight">
      <div className={`preflight-summary ${check ? (check.ok ? 'healthy' : 'stale') : ''}`}>
        <div>
          {check?.ok ? (
            <ShieldCheck size={15} />
          ) : check ? (
            <AlertTriangle size={15} />
          ) : (
            <RefreshCw size={15} />
          )}
          <strong>
            {check
              ? check.ok
                ? 'Preflight passed'
                : 'Context needs review'
              : 'Checking current context…'}
          </strong>
          <button
            className="icon-button"
            title="Check packet again"
            aria-label="Check packet again"
            onClick={() => setTick((t) => t + 1)}
          >
            <RefreshCw size={13} />
          </button>
        </div>
        {check && (
          <p>
            {check.ok
              ? 'No blocking revision drift or explicit conflicts at this check.'
              : dependencyDrift
                ? 'A derived claim depends on changed context. Review it and publish an updated dependency before recompiling.'
                : 'This packet has changed dependencies or conflicts. Review and compile a new packet before using it.'}
          </p>
        )}
        {check && <span>Checked {dateLabel(check.checkedAt)} · database revisions only</span>}
      </div>
      {check && !check.ok && (
        <details className="preflight-details">
          <summary>
            {check.drift.length} changes · {check.conflicts.length} conflicts
          </summary>
          {check.drift.map((drift, i) => (
            <DriftExplanation key={`${drift.capsuleId}-${i}`} drift={drift} onSelect={onSelect} />
          ))}
          {check.conflicts.map((c) => (
            <div className="health-drift" key={c.key}>
              <strong>{c.key}</strong>
              <p>{c.reason}</p>
            </div>
          ))}
        </details>
      )}
      {!!check?.pinnedUpdates.length && (
        <details className="preflight-details">
          <summary>{check.pinnedUpdates.length} pinned source updates</summary>
          {check.pinnedUpdates.map((d, i) => (
            <DriftExplanation key={i} drift={d} onSelect={onSelect} />
          ))}
        </details>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="receipt-toolbar">
        <button
          className="text-button"
          disabled={!canWrite || !check?.ok}
          onClick={() => {
            setShowRegister(!showRegister);
            setShowRuns(false);
          }}
        >
          <Play size={12} />
          Register use
        </button>
        <button
          className="text-button"
          onClick={() => {
            setShowRuns(!showRuns);
            setShowRegister(false);
          }}
        >
          {receipts.length} run receipt{receipts.length === 1 ? '' : 's'}
        </button>
      </div>
      {showRegister && (
        <div className="receipt-form">
          <p>Register that an agent will use this packet. This does not start the agent.</p>
          <label>
            Agent name
            <input
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              placeholder="e.g. Codex · billing task"
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || !agent.trim() || !check?.ok}
            onClick={() => void register()}
          >
            {busy ? 'Registering…' : 'Register run'}
          </button>
        </div>
      )}
      {showRuns && (
        <div className="packet-receipts">
          {!receipts.length && <p className="muted">No caller-reported runs for this packet.</p>}
          {receipts.map((receipt) => (
            <div className="packet-receipt" key={receipt.id}>
              <div>
                <strong>{receipt.agent}</strong>
                <span>{receipt.status}</span>
              </div>
              <p>
                {dateLabel(receipt.createdAt)}
                {receipt.gitCommit ? ` · ${receipt.gitCommit.slice(0, 10)}` : ''}
              </p>
              {receipt.outcome && <p>{receipt.outcome}</p>}
              {canWrite && receipt.status === 'started' && finishing?.id !== receipt.id && (
                <button
                  className="text-button"
                  onClick={() => {
                    setFinishing(receipt);
                    setOutcome('');
                    setCommit('');
                  }}
                >
                  Update outcome
                  <ArrowUpRight size={12} />
                </button>
              )}
              {finishing?.id === receipt.id && (
                <div className="receipt-form">
                  <label>
                    Outcome
                    <textarea
                      rows={2}
                      value={outcome}
                      onChange={(e) => setOutcome(e.target.value)}
                      placeholder="What happened?"
                    />
                  </label>
                  <label>
                    Git commit <span>optional</span>
                    <input
                      value={commit}
                      onChange={(e) => setCommit(e.target.value)}
                      placeholder="Commit SHA"
                    />
                  </label>
                  {!check?.ok && (
                    <p>
                      Completion is blocked by stale context. Abandon this run, review the
                      dependencies, and register a new packet.
                    </p>
                  )}
                  <div>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void finish(receipt, 'abandoned')}
                    >
                      <X size={12} />
                      Abandon
                    </button>
                    <button
                      className="text-button"
                      disabled={busy || !check?.ok}
                      onClick={() => void finish(receipt, 'completed')}
                    >
                      <Check size={12} />
                      Complete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
