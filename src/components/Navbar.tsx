import { useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const mainLinks = [
  { to: '/fiction', label: 'Browse stories' },
  { to: '/bookmark', label: 'Bookmarks' },
  { to: '/fav', label: 'My shelf' },
  { to: '/live', label: 'Live' },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/auth');
    setMenuOpen(false);
  }

  return (
    <nav className="navbar" aria-label="Main navigation" onKeyDown={(event) => {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    }}>
      <Link to="/" className="nav-brand" aria-label="Jothable home" onClick={() => setMenuOpen(false)}>
        <img src="/favicon.svg" alt="" className="nav-logo" width="28" height="28" />
        <span className="nav-title">Jothable</span>
      </Link>

      <div className="nav-links">
        {mainLinks.map(({ to, label }) => <NavLink key={to} to={to} className="nav-link">{label}</NavLink>)}
      </div>

      <div className="nav-actions">
        <button className="theme-toggle" type="button" onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}>
          <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
        </button>

        {user ? (
          <NavLink to="/profile" className="nav-link nav-account" onClick={() => setMenuOpen(false)}>Profile</NavLink>
        ) : (
          <Link to="/auth" className="btn btn-sm btn-outline nav-account" onClick={() => setMenuOpen(false)}>Sign in</Link>
        )}

        <button ref={menuButton} className="burger" type="button"
          onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}
          aria-label="Menu" aria-controls={menuOpen ? 'site-menu' : undefined}>
          <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
        </button>
      </div>

      {menuOpen && (
        <div className="nav-mobile" id="site-menu">
          <div className="nav-menu-primary">
            {mainLinks.map(({ to, label }) => (
              <NavLink key={to} to={to} className="nav-mobile-link" onClick={() => setMenuOpen(false)}>{label}</NavLink>
            ))}
          </div>
          <Link to="/about" className="nav-mobile-link" onClick={() => setMenuOpen(false)}>About</Link>
          <Link to="/why" className="nav-mobile-link" onClick={() => setMenuOpen(false)}>Why Jothable?</Link>
          {user ? (
            <>
              <Link to="/profile" className="nav-mobile-link" onClick={() => setMenuOpen(false)}>Profile</Link>
              <button type="button" onClick={handleLogout} className="nav-mobile-link">Sign out</button>
            </>
          ) : (
            <Link to="/auth" className="nav-mobile-link" onClick={() => setMenuOpen(false)}>Sign in</Link>
          )}
        </div>
      )}
    </nav>
  );
}
