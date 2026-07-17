import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/auth');
    setMenuOpen(false);
  };

  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand">
        <img src="/favicon.svg" alt="Fiction Hall" className="nav-logo" />
        <span className="nav-title">Fiction Hall</span>
      </Link>

      <div className="nav-links">
        <Link to="/" className="nav-link">Home</Link>
        <Link to="/fiction" className="nav-link">Fiction</Link>
        <Link to="/about" className="nav-link">About</Link>
        <Link to="/why" className="nav-link">Why</Link>
        <Link to="/live" className="nav-link">🎥 Live</Link>
      </div>

      <div className="nav-actions">
        <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>

        {user ? (
          <div className="nav-user">
            <Link to="/profile" className="nav-link">{user.display}</Link>
            <button onClick={handleLogout} className="btn btn-sm btn-outline">Logout</button>
          </div>
        ) : (
          <Link to="/auth" className="btn btn-sm btn-primary">Sign In</Link>
        )}

        <button className="burger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          ☰
        </button>
      </div>

      {menuOpen && (
        <div className="nav-mobile" onClick={() => setMenuOpen(false)}>
          <Link to="/" className="nav-mobile-link">Home</Link>
          <Link to="/fiction" className="nav-mobile-link">Fiction</Link>
          <Link to="/about" className="nav-mobile-link">About</Link>
          <Link to="/why" className="nav-mobile-link">Why</Link>
          <Link to="/live" className="nav-mobile-link">🎥 Live</Link>
          {user ? (
            <>
              <Link to="/profile" className="nav-mobile-link">Profile</Link>
              <button onClick={handleLogout} className="nav-mobile-link text-left">Logout</button>
            </>
          ) : (
            <Link to="/auth" className="nav-mobile-link">Sign In</Link>
          )}
        </div>
      )}
    </nav>
  );
}
