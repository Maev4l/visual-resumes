// packages/editor/src/components/editorial/MetaChip.jsx
// Small-caps mono tag. `tone="live"` = oxblood dot + label; used for "PUBLISHED",
// active/selected states, or anything that should feel editorially important.
const MetaChip = ({ tone = 'muted', children, className = '' }) => {
  const colorClass =
    tone === 'live' ? 'text-[var(--color-oxblood)]'
    : tone === 'ink'  ? 'text-[var(--color-ink)]'
    : 'text-[var(--color-ink-faint)]';
  return (
    <span className={`font-meta inline-flex items-center gap-1.5 ${colorClass} ${className}`}>
      {tone === 'live' && <span className="inline-block size-1.5 rounded-full bg-[var(--color-oxblood)]" />}
      {children}
    </span>
  );
};

export default MetaChip;
