import {
  ArrowUpRight,
  FileText,
  GitBranch,
  Link2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Tag,
} from 'lucide-react';
import type { Capsule, CapsuleKind } from '../../../src/core/types';
import { dateLabel } from './api';
const icons = {
  decision: GitBranch,
  fact: ShieldCheck,
  constraint: Tag,
  question: MessageCircle,
  artifact: FileText,
};
export function Kind({ kind }: { kind: CapsuleKind }) {
  const Icon = icons[kind];
  return (
    <span className={`kind kind-${kind}`}>
      <Icon size={12} />
      {kind}
    </span>
  );
}
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'small' : ''}`}>
      <span className="loomplane-mark">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>
        loomplane<span className="brand-period">.</span>
      </span>
    </div>
  );
}
export function CapsuleCard({
  capsule,
  mounted,
  selected,
  onSelect,
}: {
  capsule: Capsule;
  mounted?: string;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`capsule-card ${selected ? 'selected' : ''} ${capsule.status !== 'active' ? 'inactive' : ''}`}
      onClick={onSelect}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/loomplane-capsule', capsule.id);
        event.dataTransfer.effectAllowed = 'link';
      }}
    >
      <div className="card-meta">
        <Kind kind={capsule.kind} />
        <span className="version">v{capsule.version}</span>
      </div>
      <h3>{capsule.title}</h3>
      <p>{capsule.body}</p>
      <div className="card-bottom">
        <span>
          {mounted ? (
            <>
              <Link2 size={12} />
              {mounted}
            </>
          ) : (
            <>
              {capsule.evidence.length ? (
                <>
                  <FileText size={12} />
                  {capsule.evidence.length} source{capsule.evidence.length === 1 ? '' : 's'}
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  {capsule.author}
                </>
              )}
            </>
          )}
        </span>
        <span>{capsule.status === 'active' ? dateLabel(capsule.updatedAt) : capsule.status}</span>
      </div>
    </button>
  );
}
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty-inline">
      <div className="empty-symbol">
        <Link2 size={23} />
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function ExternalEvidence({ uri, label }: { uri: string; label: string }) {
  if (/^https?:\/\//i.test(uri))
    return (
      <a href={uri} target="_blank" rel="noreferrer">
        {label}
        <ArrowUpRight size={14} />
      </a>
    );
  return (
    <span className="source-label">
      {label}
      <span className="source-uri">{uri}</span>
    </span>
  );
}
