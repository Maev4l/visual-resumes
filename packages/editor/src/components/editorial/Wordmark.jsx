// packages/editor/src/components/editorial/Wordmark.jsx
// The product wordmark. Size prop maps to display scales; `withSubtitle` renders the
// tagline underneath for the Login hero.
const Wordmark = ({ size = 'md', withSubtitle = false, className = '' }) => {
  const sizes = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-5xl sm:text-6xl',
    xl: 'text-6xl sm:text-8xl',
  };
  return (
    <div className={className}>
      <h1 className={`${sizes[size]} font-serif font-light leading-[0.95] tracking-[-0.02em] text-[var(--color-ink)]`}>
        Visual<span className="italic font-normal text-[var(--color-oxblood)]">&nbsp;Résumés</span>
      </h1>
      {withSubtitle && (
        <p className="mt-3 font-meta">A typographic workshop for your CV</p>
      )}
    </div>
  );
};

export default Wordmark;
