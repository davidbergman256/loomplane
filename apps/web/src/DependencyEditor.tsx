import { ArrowUpRight, GitBranch, Plus, X } from 'lucide-react';
import type { Capsule, ContextDependency } from '../../../src/core/types';
export default function DependencyEditor({
  capsules,
  value,
  onChange,
  excludeId,
}: {
  capsules: Capsule[];
  value: ContextDependency[];
  onChange: (dependencies: ContextDependency[]) => void;
  excludeId?: string;
}) {
  const options = capsules.filter((c) => c.id !== excludeId && c.status === 'active');
  function update(index: number, patch: Partial<ContextDependency>) {
    onChange(value.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }
  return (
    <details className="dependency-editor" open={value.length > 0}>
      <summary>
        <GitBranch size={14} />
        Derived from <span>{value.length || 'optional'}</span>
      </summary>
      <p className="form-hint">
        Link the exact revisions you reviewed to make this claim. Upstream changes will flag this
        capsule and its consumers for review.
      </p>
      {value.map((dependency, index) => {
        const source = capsules.find((c) => c.id === dependency.capsuleId);
        const changed = source && source.version !== dependency.version;
        return (
          <div className="dependency-editor-item" key={index}>
            <div>
              <label>
                Source capsule
                <select
                  aria-label={`Dependency ${index + 1} capsule`}
                  value={dependency.capsuleId}
                  onChange={(e) => {
                    const next = options.find((c) => c.id === e.target.value);
                    if (next) update(index, { capsuleId: next.id, version: next.version });
                  }}
                >
                  {options
                    .filter(
                      (c) =>
                        c.id === dependency.capsuleId || !value.some((d) => d.capsuleId === c.id),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  {source && source.status !== 'active' && (
                    <option value={source.id}>
                      {source.title} ({source.status})
                    </option>
                  )}
                </select>
              </label>
              <label className="dependency-version">
                Revision
                <input
                  aria-label={`Dependency ${index + 1} revision`}
                  type="number"
                  min={1}
                  max={source?.version ?? dependency.version}
                  value={dependency.version}
                  required
                  onChange={(e) => update(index, { version: Number(e.target.value) })}
                />
              </label>
              <button
                className="icon-button"
                aria-label={`Remove dependency ${index + 1}`}
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <X size={15} />
              </button>
            </div>
            {changed && (
              <div className="dependency-review-note">
                <span>
                  Latest is v{source.version}. Review the source before changing this reference.
                </span>
                <button type="button" onClick={() => update(index, { version: source.version })}>
                  Use reviewed v{source.version}
                  <ArrowUpRight size={12} />
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="text-button dependency-add"
        disabled={!options.some((c) => !value.some((d) => d.capsuleId === c.id))}
        onClick={() => {
          const first = options.find((c) => !value.some((d) => d.capsuleId === c.id));
          if (first) onChange([...value, { capsuleId: first.id, version: first.version }]);
        }}
      >
        <Plus size={13} />
        Add dependency
      </button>
    </details>
  );
}
