// Generic 404 fallback for the SPA. Intentionally unauthenticated so stale bookmarks
// don't bounce users through the Hosted-UI redirect loop before showing an error.
const NotFound = () => (
  <main className="min-h-screen grid place-items-center">
    <h1 className="text-2xl">Not found</h1>
  </main>
);

export default NotFound;
