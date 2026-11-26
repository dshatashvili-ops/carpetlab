import { Link, NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../session/SessionProvider';

export function Layout() {
  const { user } = useSession();
  return (
    <div className="paper-grid" style={{ minHeight: '100vh' }}>
      <header className="site-nav">
        <div className="container">
          <Link to="/" className="logo"><img src="/logo-mark.svg" alt="" width="26" height="26" /><span>Carpet<b>LAB</b></span></Link>
          <nav className="nav-links" aria-label="Основная навигация">
            <NavLink to="/pricing">Тарифы</NavLink>
            <NavLink to="/demo">Демо</NavLink>
            {user ? <NavLink to="/app">Кабинет</NavLink> : <NavLink to="/login">Войти</NavLink>}
          </nav>
        </div>
      </header>
      <main className="container"><Outlet /></main>
      <footer className="container footer">© CarpetLAB. Учет рулонов, обрезков и готовых ковров.</footer>
    </div>
  );
}
