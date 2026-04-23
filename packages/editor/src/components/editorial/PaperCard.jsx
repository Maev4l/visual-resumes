// packages/editor/src/components/editorial/PaperCard.jsx
// A "sheet of paper" surface for Dashboard rows + the New page template picker.
// Depth comes from a very soft vertical-bias shadow and a 1-pixel outline rule,
// not from Material-style drop shadows. On hover the card lifts a hair and tilts
// by fractions of a degree — a Raycast-like detail that rewards pointer attention.
const PaperCard = ({ as: Tag = 'div', active = false, interactive = false, className = '', children, ...rest }) => {
  const base = 'relative bg-[var(--color-paper)] border transition-all duration-200';
  const borderColor = active
    ? 'border-[var(--color-ink)]'
    : 'border-[var(--color-rule)]';
  const shadow = 'shadow-[0_1px_0_var(--color-rule-soft),0_8px_18px_-14px_rgba(26,24,20,0.35)]';
  const hover = interactive
    ? 'hover:shadow-[0_2px_0_var(--color-rule-soft),0_16px_26px_-14px_rgba(26,24,20,0.45)] hover:-translate-y-[1px] hover:rotate-[-0.15deg] hover:border-[var(--color-ink-faint)]'
    : '';
  return (
    <Tag className={`${base} ${borderColor} ${shadow} ${hover} ${className}`} {...rest}>
      {children}
    </Tag>
  );
};

export default PaperCard;
