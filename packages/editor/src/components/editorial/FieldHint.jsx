// packages/editor/src/components/editorial/FieldHint.jsx
// Ghost hint shown BELOW each form field's label so the author can see how their
// input will be typeset in the published document. Rendered in Fraunces to mirror
// the template output style (templates all use serif display type for headlines).
const FieldHint = ({ children, as = 'serif' }) => {
  const typeClass =
    as === 'serif' ? 'font-serif italic text-[var(--color-ink-faint)]'
    : as === 'meta' ? 'font-meta'
    : 'font-sans text-[var(--color-ink-faint)] italic';
  return (
    <span className={`block text-xs leading-relaxed mt-0.5 ${typeClass}`}>
      <span className="not-italic font-sans text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)] mr-1.5">renders as</span>
      {children}
    </span>
  );
};

export default FieldHint;
