import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { setUnauthorizedHandler } from './api/client';
import { Layout } from './components/Layout';
import { AppLayout } from './components/AppLayout';
import { AppHome } from './pages/AppHome';
import { AcceptInvite } from './pages/AcceptInvite';
import { Admin } from './pages/Admin';
import { Articles } from './pages/Articles';
import { Billing } from './pages/Billing';
import { Employees } from './pages/Employees';
import { OrgSettings } from './pages/OrgSettings';
import { Cutting } from './pages/Cutting';
import { DocumentView } from './pages/DocumentView';
import { Documents } from './pages/Documents';
import { Problems } from './pages/Problems';
import { Sizes } from './pages/Sizes';
import { Stock } from './pages/Stock';
import { Demo } from './pages/Demo';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Pricing } from './pages/Pricing';
import { Register } from './pages/Register';
import { SessionProvider, useSession } from './session/SessionProvider';

function Protected({ children }: { children: JSX.Element }) {
  const { loading, user } = useSession();
  if (loading) return <p className="container muted">Загрузка…</p>;
  return user ? children : <Navigate to="/login" replace />;
}

function ServiceAdminOnly({ children }: { children: JSX.Element }) {
  const { user } = useSession();
  return user?.isServiceAdmin ? children : <p className="section">Нет доступа.</p>;
}

function UnauthorizedRedirect() {
  const navigate = useNavigate();
  useEffect(() => { setUnauthorizedHandler(() => navigate('/login')); return () => setUnauthorizedHandler(null); }, [navigate]);
  return null;
}

export function AppRoutes() {
  return (
    <SessionProvider>
      <UnauthorizedRedirect />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
        </Route>
        <Route path="/app" element={<Protected><AppLayout /></Protected>}>
          <Route index element={<AppHome />} />
          <Route path="articles" element={<Articles />} />
          <Route path="sizes" element={<Sizes />} />
          <Route path="stock" element={<Stock />} />
          <Route path="cutting" element={<Cutting />} />
          <Route path="documents" element={<Documents />} />
          <Route path="documents/:id" element={<DocumentView />} />
          <Route path="problems" element={<Problems />} />
          <Route path="billing" element={<Billing />} />
          <Route path="employees" element={<Employees />} />
          <Route path="settings" element={<OrgSettings />} />
          <Route path="admin" element={<ServiceAdminOnly><Admin /></ServiceAdminOnly>} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}

export function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}
