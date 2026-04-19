// Route map for the SPA. AuthProvider wraps everything so RequireAuth can read
// live session status. Cognito callback lands on `/` — Amplify reads the `?code`
// from the URL automatically on load, so no dedicated callback route is needed
// (this also avoids CloudFront SPA-fallback pain on a deep route that S3 can't serve).
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import RequireAuth from '@/auth/RequireAuth';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import New from '@/pages/New';
import Edit from '@/pages/Edit';
import Pending from '@/pages/Pending';
import NotFound from '@/pages/NotFound';

const App = () => (
  <AuthProvider>
    <Routes>
      <Route path="/login"    element={<Login />} />
      <Route path="/pending"  element={<Pending />} />
      <Route path="/"         element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/new"      element={<RequireAuth><New /></RequireAuth>} />
      <Route path="/edit/:id" element={<RequireAuth><Edit /></RequireAuth>} />
      <Route path="*"         element={<NotFound />} />
    </Routes>
  </AuthProvider>
);

export default App;
