import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, GitBranch, Search, X } from 'lucide-react';
import type { StartedTask, StartTaskInput } from '../../../src/core/types';
import { api } from './api';
import { useAuth } from './Auth';
import type { FormResult } from './Forms';
import type { WorkspaceView } from './workspace';

export default function StartTaskForm({
  snapshot,
  onClose,
  onSaved,
}: {
  snapshot: WorkspaceView;
  onClose: () => void;
  onSaved: (result?: FormResult) => void;
}) {
  const { canWrite } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const active = snapshot.capsules.filter((capsule) => capsule.status === 'active');
  const visible = active.filter((capsule) =>
    `${capsule.title} ${capsule.tags.join(' ')} ${capsule.body}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const unavailable = selected.some((id) => !active.some((capsule) => capsule.id === id));
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function close() {
    if (!submitting.current) onClose();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !canWrite || !snapshot.project || !selected.length || unavailable)
      return;
    submitting.current = true;
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name) ?? '').trim();
    const input: StartTaskInput = {
      projectId: snapshot.project.id,
      name: field('name'),
      task: field('task'),
      agent: field('agent'),
      budget: Number(field('budget')),
      context: selected.map((capsuleId) => ({ capsuleId, mode: 'live' })),
    };
    try {
      const result = await api<StartedTask>('/tasks/start', input);
      onSaved({ packet: result.packet, startedTask: result });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start this task.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal start-task-modal"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
    >
      <form onSubmit={submit}>
        <header className="modal-heading">
          <div>
            <span className="modal-category">Independent work · shared understanding</span>
            <h2>Give this task its own context.</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>
        <div className="form-content">
          <p className="task-start-intro">
            <GitBranch size={18} />
            <span>
              Create an independent stream, compile the context you choose, and record a run
              receipt. No model is started.
            </span>
          </p>
          <label>
            Task name
            <input
              name="name"
              required
              maxLength={120}
              autoFocus
              disabled={busy}
              placeholder="e.g. Build the usage dashboard"
            />
          </label>
          <label>
            What should be done?
            <textarea
              name="task"
              rows={3}
              maxLength={3000}
              required
              disabled={busy}
              placeholder="Describe the work and the result you expect."
            />
          </label>
          <div className="form-row">
            <label>
              Agent name
              <input
                name="agent"
                maxLength={120}
                required
                disabled={busy}
                placeholder="e.g. Dashboard agent"
              />
              <span className="form-hint">A label for who will use this context.</span>
            </label>
            <label>
              Context budget
              <input
                name="budget"
                type="number"
                min={256}
                max={100000}
                step={1}
                defaultValue={4000}
                required
                disabled={busy}
              />
              <span className="form-hint">Estimated tokens, including task and framing.</span>
            </label>
          </div>
          <fieldset className="task-context-picker" disabled={busy}>
            <legend>
              Choose shared context <span>{selected.length} / 100 selected</span>
            </legend>
            <p className="form-hint">
              Choose at least one current capsule. These connections follow the latest revision and
              report changes. Only your selected capsules are included.
            </p>
            {active.length ? (
              <>
                <label className="task-context-search">
                  <Search size={14} />
                  <input
                    aria-label="Filter shared context"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Find a capsule…"
                  />
                </label>
                <div className="task-context-options">
                  {visible.map((capsule) => {
                    const checked = selected.includes(capsule.id);
                    const owner =
                      snapshot.streams.find((state) => state.stream.id === capsule.streamId)?.stream
                        .name ?? 'Project commons';
                    return (
                      <label
                        className={`task-context-option ${checked ? 'selected' : ''}`}
                        key={capsule.id}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && selected.length >= 100}
                          onChange={() =>
                            setSelected((previous) =>
                              checked
                                ? previous.filter((id) => id !== capsule.id)
                                : [...previous, capsule.id],
                            )
                          }
                        />
                        <span>
                          <strong>{capsule.title}</strong>
                          <small>
                            {owner} · {capsule.kind} · v{capsule.version}
                          </small>
                          <span className="task-context-excerpt">{capsule.body}</span>
                        </span>
                      </label>
                    );
                  })}
                  {!visible.length && (
                    <p className="form-hint task-context-empty">
                      No matching capsules. Try another title or phrase.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="task-context-empty">
                Publish a capsule first, then return here to start a task with shared context.
              </p>
            )}
            {unavailable && (
              <p className="form-error" role="alert">
                Some selected context is no longer active.{' '}
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    setSelected((previous) =>
                      previous.filter((id) => active.some((capsule) => capsule.id === id)),
                    )
                  }
                >
                  Remove unavailable context
                </button>
              </p>
            )}
          </fieldset>
          <p className="form-hint">
            Every selected capsule must fit in the packet. Conflicts or stale derived claims must be
            resolved before the task can start.
          </p>
        </div>
        <footer className="modal-footer">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button secondary" type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !canWrite || !selected.length || unavailable}
          >
            {busy ? 'Preparing task…' : 'Start task'}
            <ArrowRight size={15} />
          </button>
        </footer>
      </form>
    </dialog>
  );
}
