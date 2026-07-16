import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">Feeling drives creation;<br />Arts and Writing fuel the future.</h1>
          <p className="hero-subtitle">Turn your creativity into a lifestyle inside this hub that backs you up.</p>
          <div className="hero-buttons">
            <Link to={user ? '/fiction' : '/auth'} className="btn btn-primary btn-lg">
              Start Creating
            </Link>
            <Link to="/why" className="btn btn-outline btn-lg">
              Learn More
            </Link>
          </div>
        </div>
      </section>

      <section className="features">
        <h2>Why Fiction Hall?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <h3>✍️ Write Freely</h3>
            <p>Rich text editor with markdown support. Auto-save as you write.</p>
          </div>
          <div className="feature-card">
            <h3>📚 Organize</h3>
            <p>Collections, chapters, labels, genres — keep your stories structured.</p>
          </div>
          <div className="feature-card">
            <h3>💰 Earn</h3>
            <p>Set your own pricing. Keep 95% of revenue on rentals, 90% on permanent sales.</p>
          </div>
          <div className="feature-card">
            <h3>🔒 Secure</h3>
            <p>TOTP two-factor auth and security questions protect your account.</p>
          </div>
        </div>
      </section>

      {!user && (
        <section className="cta">
          <h2>Ready to Join?</h2>
          <p>Free to sign up and start writing. No subscription required.</p>
          <Link to="/auth" className="btn btn-primary btn-lg">Sign Up Now</Link>
        </section>
      )}
    </div>
  );
}
