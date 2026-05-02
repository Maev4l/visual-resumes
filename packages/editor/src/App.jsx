// Route map for the SPA. AuthProvider wraps everything so RequireAuth can read
// live session status. Cognito callback lands on `/` — Amplify reads the `?code`
// from the URL automatically on load, so no dedicated callback route is needed
// (this also avoids CloudFront SPA-fallback pain on a deep route that S3 can't serve).
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import RequireAuth from '@/auth/RequireAuth';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import New from '@/pages/New';
import Edit from '@/pages/Edit';
import Pending from '@/pages/Pending';
import NotFound from '@/pages/NotFound';
import Templates from '@/pages/Templates';

// Preview is the only route that pulls in handlebars + markdown-it (via the
// shared renderer). Lazy-loading keeps those ~300 kB out of the main bundle —
// the editor loads fast, and the preview window pays the cost only when opened.
const Preview = lazy(() => import('@/pages/Preview'));

const App = () => (
  <AuthProvider>
    <Suspense fallback={null}>
      <Routes>
        <Route path="/login"       element={<Login />} />
        <Route path="/pending"     element={<Pending />} />
        <Route path="/"            element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/new"         element={<RequireAuth><New /></RequireAuth>} />
        <Route path="/edit/:id"    element={<RequireAuth><Edit /></RequireAuth>} />
        <Route path="/preview/:id" element={<RequireAuth><Preview /></RequireAuth>} />
        <Route path="/templates"   element={<RequireAuth><Templates /></RequireAuth>} />
        <Route path="*"            element={<NotFound />} />
      </Routes>
    </Suspense>
  </AuthProvider>
);

export default App;
