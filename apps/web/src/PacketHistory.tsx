import { useEffect, useState } from 'react';
import { ArrowUpRight, GitCompareArrows } from 'lucide-react';
import type { Packet, PacketDiff, PacketPage, PacketSummary } from '../../../src/core/types';
import { api } from './api';
import type { Selection } from './Inspector';

const stamp = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

export function PacketHistory({
  packet,
  onSelect,
}: {
  packet: Packet;
  onSelect: (selection: Selection) => void;
}) {
  const [history, setHistory] = useState<PacketSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [baseline, setBaseline] = useState('');
  const [diff, setDiff] = useState<PacketDiff | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<PacketPage>(`/streams/${packet.streamId}/packets?limit=10`)
      .then((page) => {
        if (!active) return;
        setHistory(page.items);
        setCursor(page.nextCursor);
        const index = page.items.findIndex((p) => p.id === packet.id);
        setBaseline(index >= 0 ? (page.items[index + 1]?.id ?? '') : '');
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [packet.id, packet.streamId]);
  useEffect(() => {
    let active = true;
    setDiff(null);
    if (!baseline) return;
    setComparing(true);
    api<PacketDiff>(`/packets/${baseline}/compare?to=${packet.id}`)
      .then((value) => {
        if (active) setDiff(value);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setComparing(false);
      });
    return () => {
      active = false;
    };
  }, [baseline, packet.id]);
  async function more() {
    if (!cursor) return;
    setLoading(true);
    setError('');
    try {
      const page = await api<PacketPage>(
        `/streams/${packet.streamId}/packets?limit=10&before=${cursor}`,
      );
      setHistory((previous) => [...previous, ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function inspect(id: string) {
    try {
      onSelect({ type: 'packet', packet: await api<Packet>(`/packets/${id}`) });
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div className="packet-history">
      <p className="muted">
        Compare recorded inputs. Refreshing context does not confirm that the code was rechecked.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <label className="packet-baseline">
        Compare this packet with
        <select
          value={baseline}
          onChange={(event) => {
            setError('');
            setBaseline(event.target.value);
          }}
        >
          <option value="">Choose a baseline packet</option>
          {history
            .filter((p) => p.id !== packet.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {stamp(p.createdAt)} · {p.id.slice(-6)}
              </option>
            ))}
        </select>
      </label>
      {comparing && baseline && (
        <p className="muted" role="status">
          Comparing recorded context…
        </p>
      )}
      {diff && (
        <section className="packet-comparison" aria-label="Packet comparison">
          <div className="packet-delta-heading">
            <GitCompareArrows size={16} />
            <strong>{diff.changed ? 'Context changed' : 'Same recorded context'}</strong>
          </div>
          <p className="muted">
            Baseline → inspected packet · {diff.unchangedCapsules} unchanged capsule
            {diff.unchangedCapsules === 1 ? '' : 's'}
          </p>
          {diff.capsuleChanges.map((item) => (
            <details className="packet-delta" key={item.capsuleId}>
              <summary>
                <strong>{item.after?.revision.title ?? item.before?.revision.title}</strong>
                <span>{item.changes.join(' + ')}</span>
              </summary>
              {(['before', 'after'] as const).map((side) => (
                <div className={`packet-delta-side ${side}`} key={side}>
                  <small>
                    {side === 'before' ? 'Baseline' : 'Inspected packet'}
                    {item[side] &&
                      ` · v${item[side].revision.version} · ${item[side].manifest.mode}`}
                  </small>
                  {item[side] ? (
                    <>
                      <strong>{item[side].revision.title}</strong>
                      <p>{item[side].revision.body}</p>
                      <details className="packet-metadata">
                        <summary>Revision details</summary>
                        <pre>
                          {JSON.stringify(
                            {
                              author: item[side].revision.author,
                              changeNote: item[side].revision.changeNote,
                              tags: item[side].revision.tags,
                              priority: item[side].revision.priority,
                              dependencies: item[side].revision.dependencies ?? [],
                              evidence: item[side].revision.evidence,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </>
                  ) : (
                    <p>Not included in this packet.</p>
                  )}
                </div>
              ))}
            </details>
          ))}
          {diff.task.changed && (
            <div className="packet-value-change">
              <strong>Task changed</strong>
              <p>
                {diff.task.before || 'No task'} → {diff.task.after || 'No task'}
              </p>
            </div>
          )}
          {diff.budget.changed && (
            <div className="packet-value-change">
              <strong>Budget changed</strong>
              <p>
                {diff.budget.before.toLocaleString()} → {diff.budget.after.toLocaleString()}{' '}
                estimated tokens
              </p>
            </div>
          )}
          {diff.estimatedTokens.changed && (
            <p className="muted">
              Packet size: {diff.estimatedTokens.before.toLocaleString()} →{' '}
              {diff.estimatedTokens.after.toLocaleString()} estimated tokens.
            </p>
          )}
          {diff.manifestOrder.changed && (
            <p className="muted">Included capsules or their order changed.</p>
          )}
          {diff.omissions.changed && (
            <details className="packet-delta">
              <summary>Omitted context changed</summary>
              <p>
                Baseline:{' '}
                {diff.omissions.before.map((o) => `${o.title} (${o.reason})`).join('; ') || 'None'}
              </p>
              <p>
                Inspected:{' '}
                {diff.omissions.after.map((o) => `${o.title} (${o.reason})`).join('; ') || 'None'}
              </p>
            </details>
          )}
          {diff.conflicts.changed && (
            <details className="packet-delta">
              <summary>Explicit conflicts changed</summary>
              <p>Baseline: {diff.conflicts.before.map((c) => c.key).join(', ') || 'None'}</p>
              <p>Inspected: {diff.conflicts.after.map((c) => c.key).join(', ') || 'None'}</p>
            </details>
          )}
          {diff.textChanged && !diff.capsuleChanges.length && (
            <p className="muted">
              Rendered packet text changed. Inspect each packet to read its complete text.
            </p>
          )}
        </section>
      )}
      <section className="inspector-section">
        <h4>Recorded packets</h4>
        <p className="muted">Newest first. Open a packet to inspect its original manifest.</p>
        <div className="packet-history-list">
          {history.map((item) => (
            <button
              key={item.id}
              disabled={item.id === packet.id}
              onClick={() => void inspect(item.id)}
            >
              <span>
                <strong>{item.task || 'Untitled task'}</strong>
                <small>
                  {stamp(item.createdAt)} · {item.id.slice(-6)}
                </small>
                <small>
                  {item.capsuleCount} capsules · {item.omittedCount} omitted
                  {item.id === packet.id ? ' · inspecting' : ''}
                </small>
              </span>
              <ArrowUpRight size={13} />
            </button>
          ))}
        </div>
        {loading && (
          <p className="muted" role="status">
            Loading packet history…
          </p>
        )}
        {cursor && (
          <button className="button secondary" disabled={loading} onClick={() => void more()}>
            Load older packets
          </button>
        )}
        {!loading && history.length < 2 && (
          <p className="muted">Compile another packet after a change to compare its inputs here.</p>
        )}
      </section>
    </div>
  );
}
