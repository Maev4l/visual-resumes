// packages/editor/src/components/editorial/RuleLine.jsx
// Single hair rule used in place of shadcn card borders for section separation.
// `double` variant = the double-line printer's mark commonly used before/after a lead.
const RuleLine = ({ variant = 'single', className = '' }) => {
  if (variant === 'double') {
    return (
      <div className={`w-full ${className}`} aria-hidden="true">
        <div className="h-px bg-[var(--color-rule)]" />
        <div className="h-px bg-[var(--color-rule)] mt-[3px]" />
      </div>
    );
  }
  return <div className={`h-px bg-[var(--color-rule)] w-full ${className}`} aria-hidden="true" />;
};

export default RuleLine;
