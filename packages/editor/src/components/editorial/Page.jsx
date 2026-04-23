// packages/editor/src/components/editorial/Page.jsx
// Consistent canvas for every top-level route. WHY a component rather than Tailwind
// utility soup repeated on each page: the editorial aesthetic lives in small details
// (max-width, leading, vertical rhythm) that must stay in sync across pages.
const Page = ({ children, className = '', width = 'reading' }) => {
  const widths = {
    reading: 'max-w-[72ch]',   // ~text columns, for Login/Pending/NotFound
    standard: 'max-w-5xl',     // Dashboard, New
    wide:    'max-w-7xl',      // Edit
  };
  return (
    <main className={`min-h-screen bg-[var(--color-paper)] text-[var(--color-ink-soft)]`}>
      <div className={`${widths[width]} mx-auto px-6 py-10 ${className}`}>
        {children}
      </div>
    </main>
  );
};

export default Page;
