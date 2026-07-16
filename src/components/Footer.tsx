import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-links">
        <Link to="/terms">Terms of Service</Link>
        <span className="footer-sep">•</span>
        <Link to="/privacy">Privacy Policy</Link>
      </div>
      <p>© {new Date().getFullYear()} Fiction Hall — Fiction Writing Platform</p>
      <p className="footer-tagline">Feeling drives creation; Arts and Writing fuel the future.</p>
    </footer>
  );
}
