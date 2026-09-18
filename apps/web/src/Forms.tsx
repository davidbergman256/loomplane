import type { WorkspaceView } from './workspace';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Link2, X } from 'lucide-react';
import type { Capsule, CapsuleKind, Packet, Project, Stream } from '../../../src/core/types';
import { api } from './api';
import DependencyEditor from './DependencyEditor';
import StartTaskForm from './StartTaskForm';
import type { StartedTask } from '../../../src/core/types';
export type FormKind =
  | { type: 'task' }
  | { type: 'project' }
  | { type: 'stream' }
  | { type: 'capsule'; streamId?: string; capsule?: Capsule }
  | { type: 'mount'; streamId?: string; capsuleId?: string }
  | { type: 'compile'; streamId: string };
export interface FormResult {
  projectId?: string;
  capsule?: Capsule;
  packet?: Packet;
  startedTask?: StartedTask;
}
interface Props {
  form: FormKind;
  snapshot: WorkspaceView;
  onClose: () => void;
  onSaved: (result?: FormResult) => void;
}
export default function Forms(props: Props) {
  return props.form.type === 'task' ? (
    <StartTaskForm {...props} />
  ) : (
    <ContextForm {...props} form={props.form} />
  );
}
function ContextForm({
  form,
  snapshot,
  onClose,
  onSaved,
}: Omit<Props, 'form'> & { form: Exclude<FormKind, { type: 'task' }> }) {
  const edit = form.type === 'capsule' ? form.capsule : undefined;
  const streamId = 'streamId' in form ? form.streamId : undefined;
  const currentStream = snapshot.streams.find((s) => s.stream.id === streamId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('live');
  const [dependencies, setDependencies] = useState(edit?.dependencies ?? []);
  const [capsuleId, setCapsuleId] = useState(
    form.type === 'mount' ? (form.capsuleId ?? snapshot.capsules[0]?.id ?? '') : '',
  );
  const selectedCapsule = snapshot.capsules.find((c) => c.id === capsuleId);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const heading =
    form.type === 'project'
      ? 'A place for shared knowledge.'
      : form.type === 'stream'
        ? 'Start an independent stream.'
        : form.type === 'mount'
          ? 'Connect knowledge to work.'
          : form.type === 'compile'
            ? 'Compile a working context.'
            : edit
              ? 'Publish the next revision.'
              : 'Make knowledge addressable.';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const fd = new FormData(event.currentTarget);
    const str = (key: string) => String(fd.get(key) ?? '').trim();
    try {
      const projectId = snapshot.project?.id;
      if (form.type === 'project') {
        const project = await api<Project>('/projects', {
          name: str('name'),
          description: str('description'),
        });
        onSaved({ projectId: project.id });
      } else if (form.type === 'stream') {
        await api<Stream>('/streams', {
          projectId,
          name: str('name'),
          description: str('description'),
          agent: str('agent') || 'Unassigned',
          branch: str('branch'),
          color: str('color'),
        });
        onSaved();
      } else if (form.type === 'capsule') {
        const evidence = str('evidenceUri')
          ? [
              {
                ...(edit?.evidence[0]?.uri === str('evidenceUri') ? edit.evidence[0] : {}),
                label: str('evidenceLabel') || str('evidenceUri'),
                uri: str('evidenceUri'),
                excerpt: str('evidenceExcerpt') || undefined,
              },
            ]
          : [];
        const common = {
          dependencies,
          title: str('title'),
          body: str('body'),
          author: str('author') || 'You',
          tags: str('tags')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          priority: Number(str('priority')),
          evidence: edit ? [...evidence, ...edit.evidence.slice(1)] : evidence,
        };
        const capsule = edit
          ? await api<Capsule>(
              `/capsules/${edit.id}`,
              { ...common, expectedVersion: edit.version, changeNote: str('changeNote') },
              'PATCH',
            )
          : await api<Capsule>('/capsules', {
              ...common,
              projectId,
              kind: str('kind') as CapsuleKind,
              key: str('key'),
              streamId: str('streamId') || null,
            });
        onSaved({ capsule });
      } else if (form.type === 'mount') {
        await api('/mounts', {
          streamId: str('streamId'),
          capsuleId,
          mode,
          ...(mode === 'pinned' ? { pinnedVersion: Number(str('pinnedVersion')) } : {}),
        });
        onSaved();
      } else {
        const packet = await api<Packet>('/compile', {
          streamId: form.streamId,
          task: str('task'),
          budget: Number(str('budget')),
        });
        onSaved({ packet });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save.');
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header className="modal-heading">
          <div>
            <span className="modal-category">
              {edit
                ? `Revise capsule · v${edit.version + 1}`
                : `${form.type === 'compile' ? 'Context packet' : `New ${form.type === 'mount' ? 'connection' : form.type}`}`}
            </span>
            <h2>{heading}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="form-content">
          {(form.type === 'project' || form.type === 'stream') && (
            <>
              <label>
                Name
                <input
                  name="name"
                  required
                  autoFocus
                  placeholder={
                    form.type === 'project' ? 'e.g. Atlas platform' : 'e.g. API & contracts'
                  }
                  maxLength={120}
                />
              </label>
              <label>
                Description
                <textarea name="description" placeholder="What belongs here?" rows={3} />
              </label>
            </>
          )}
          {form.type === 'stream' && (
            <>
              <div className="form-row">
                <label>
                  Agent
                  <input name="agent" placeholder="e.g. Claude · API agent" />
                </label>
                <label>
                  Git branch
                  <input name="branch" placeholder="e.g. feat/api" />
                </label>
              </div>
              <label>
                Stream color
                <select name="color" defaultValue="#7270b5">
                  <option value="#7270b5">Iris</option>
                  <option value="#318e87">Lagoon</option>
                  <option value="#ca806b">Coral</option>
                  <option value="#4f7aa8">Blue</option>
                </select>
              </label>
              <p className="form-hint">
                A stream tracks independently scoped work. Creating one does not start an agent.
              </p>
            </>
          )}
          {form.type === 'capsule' && (
            <>
              <label>
                Title
                <input
                  autoFocus
                  name="title"
                  required
                  defaultValue={edit?.title}
                  placeholder="The one thing another agent should know"
                  maxLength={300}
                />
              </label>
              {!edit && (
                <div className="form-row">
                  <label>
                    Kind
                    <select name="kind">
                      <option value="decision">Decision</option>
                      <option value="fact">Fact</option>
                      <option value="constraint">Constraint</option>
                      <option value="question">Question</option>
                      <option value="artifact">Artifact</option>
                    </select>
                  </label>
                  <label>
                    Belongs to
                    <select name="streamId" defaultValue={streamId ?? ''}>
                      <option value="">Project commons</option>
                      {snapshot.streams.map((s) => (
                        <option key={s.stream.id} value={s.stream.id}>
                          {s.stream.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <label>
                Context
                <textarea
                  name="body"
                  required
                  rows={6}
                  defaultValue={edit?.body}
                  placeholder="State the decision, explain the reason, and make the boundaries explicit."
                />
              </label>
              {!edit && (
                <label>
                  Semantic key <span className="optional">optional</span>
                  <input name="key" placeholder="e.g. api.authentication" />
                  <span className="form-hint">
                    Capsules with the same key and different content surface as a conflict.
                  </span>
                </label>
              )}
              <div className="form-row">
                <label>
                  Author
                  <input name="author" defaultValue={edit?.author ?? 'You'} required />
                </label>
                <label>
                  Priority
                  <select name="priority" defaultValue={edit?.priority ?? 50}>
                    <option value="100">Essential · 100</option>
                    <option value="75">High · 75</option>
                    <option value="50">Normal · 50</option>
                    <option value="25">Supporting · 25</option>
                    {edit && ![100, 75, 50, 25].includes(edit.priority) && (
                      <option value={edit.priority}>Current · {edit.priority}</option>
                    )}
                  </select>
                </label>
              </div>
              <label>
                Tags
                <input
                  name="tags"
                  defaultValue={edit?.tags.join(', ')}
                  placeholder="architecture, api, security"
                />
              </label>
              <details className="evidence-form" open={!!edit?.evidence.length}>
                <summary>
                  <Link2 size={14} /> Evidence & provenance
                </summary>
                <label>
                  Source label
                  <input
                    name="evidenceLabel"
                    defaultValue={edit?.evidence[0]?.label}
                    placeholder="e.g. API contract, ADR-004"
                  />
                </label>
                <label>
                  Source reference
                  <input
                    name="evidenceUri"
                    defaultValue={edit?.evidence[0]?.uri}
                    placeholder="https://… or repo://docs/contract.md"
                  />
                </label>
                <label>
                  Relevant excerpt
                  <textarea
                    name="evidenceExcerpt"
                    rows={2}
                    defaultValue={edit?.evidence[0]?.excerpt}
                  />
                </label>
                {!!edit && edit.evidence.length > 1 && (
                  <p className="form-hint">
                    The other {edit.evidence.length - 1} existing source(s) will be preserved.
                  </p>
                )}
              </details>
              <DependencyEditor
                capsules={snapshot.capsules}
                value={dependencies}
                onChange={setDependencies}
                excludeId={edit?.id}
              />
              {edit && (
                <label>
                  What changed?
                  <input
                    name="changeNote"
                    required
                    placeholder="Give downstream agents a reason for this revision"
                  />
                </label>
              )}
            </>
          )}
          {form.type === 'mount' && (
            <>
              <p className="form-hint">
                Subscribe a stream to a capsule from anywhere in this project. The source stays
                independently versioned.
              </p>
              <label>
                Capsule
                <select value={capsuleId} onChange={(e) => setCapsuleId(e.target.value)} required>
                  {snapshot.capsules
                    .filter((c) => c.status === 'active')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} · v{c.version}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Destination stream
                <select
                  name="streamId"
                  required
                  defaultValue={streamId ?? snapshot.streams[0]?.stream.id}
                >
                  {snapshot.streams.map((s) => (
                    <option key={s.stream.id} value={s.stream.id}>
                      {s.stream.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subscription
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="live">
                    Latest revision · report drift when the source changes
                  </option>
                  <option value="pinned">Pinned revision · keep this context reproducible</option>
                </select>
              </label>
              {mode === 'pinned' && (
                <label>
                  Revision number
                  <input
                    type="number"
                    name="pinnedVersion"
                    min={1}
                    max={selectedCapsule?.version ?? 1}
                    defaultValue={selectedCapsule?.version ?? 1}
                    key={capsuleId}
                    required
                  />
                </label>
              )}
            </>
          )}
          {form.type === 'compile' && (
            <>
              <div className="compile-context">
                <span className="stream-dot" style={{ background: currentStream?.stream.color }} />
                <strong>{currentStream?.stream.name}</strong>
                <span>
                  {(currentStream?.owned.length ?? 0) + (currentStream?.mounts.length ?? 0)} context
                  inputs
                </span>
              </div>
              <label>
                Task
                <textarea
                  name="task"
                  rows={3}
                  defaultValue={currentStream?.latestPacket?.task}
                  placeholder="What should the agent work on with this context?"
                />
              </label>
              <label>
                Context budget
                <input
                  name="budget"
                  type="number"
                  min={128}
                  max={1000000}
                  step={1}
                  required
                  defaultValue={currentStream?.latestPacket?.budget ?? 4000}
                />
                <span className="form-hint">
                  Estimated tokens, including packet framing and the task. The compiler records
                  every included revision and explains omissions.
                </span>
              </label>
              <p className="form-hint">
                Compilation assembles local context. It does not call a model or start an agent.
              </p>
            </>
          )}
        </div>
        <footer className="modal-footer">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? 'Saving…'
              : form.type === 'compile'
                ? 'Compile packet'
                : edit
                  ? 'Publish revision'
                  : form.type === 'mount'
                    ? 'Connect capsule'
                    : `Create ${form.type}`}
            <ArrowRight size={15} />
          </button>
        </footer>
      </form>
    </dialog>
  );
}
