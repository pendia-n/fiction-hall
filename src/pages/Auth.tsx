import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = '/api';

export default function Auth() {
  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<'login' | 'signup'>('login');

  // Login fields
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup fields
  const [username, setUsername] = useState('');
  const [display, setDisplay] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');

  // Security questions during signup
  const [allQuestions, setAllQuestions] = useState<any[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<{ questionId: number; answer: string }[]>([
    { questionId: 0, answer: '' }, { questionId: 0, answer: '' }, { questionId: 0, answer: '' },
    { questionId: 0, answer: '' }, { questionId: 0, answer: '' },
  ]);

  // Terms & Privacy modals
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [termsRead, setTermsRead] = useState(false);
  const [privacyRead, setPrivacyRead] = useState(false);
  const termsRef = useRef<HTMLDivElement>(null);
  const privacyRef = useRef<HTMLDivElement>(null);

  // Live check
  const [usernameStatus, setUsernameStatus] = useState<'checking' | 'available' | 'taken' | null>(null);
  const [displayStatus, setDisplayStatus] = useState<'checking' | 'available' | 'taken' | null>(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) { navigate('/fiction'); return null; }

  // Load questions
  useEffect(() => {
    fetch(`${API}/auth/questions`).then(r => r.json()).then(setAllQuestions);
  }, []);

  // Live username check
  useEffect(() => {
    if (!username || username.length < 3) { setUsernameStatus(null); return; }
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/auth/check/username?username=${encodeURIComponent(username)}`);
        const data = await res.json();
        setUsernameStatus(data.available ? 'available' : 'taken');
      } catch { setUsernameStatus(null); }
    }, 500);
    return () => clearTimeout(timer);
  }, [username]);

  // Live display name check
  useEffect(() => {
    if (!display || display.length < 2) { setDisplayStatus(null); return; }
    setDisplayStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/auth/check/display?display=${encodeURIComponent(display)}`);
        const data = await res.json();
        setDisplayStatus(data.available ? 'available' : 'taken');
      } catch { setDisplayStatus(null); }
    }, 500);
    return () => clearTimeout(timer);
  }, [display]);

  // Generate TOTP secret when user opts in
  useEffect(() => {
    if (totpEnabled && !totpSecret) {
      const secret = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]).join('');
      setTotpSecret(secret);
    }
  }, [totpEnabled, totpSecret]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(loginUsername, loginPassword);
      navigate('/fiction');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 7) { setError('Password must be at least 7 characters'); return; }
    if (usernameStatus === 'taken') { setError('Username is already taken'); return; }
    if (displayStatus === 'taken') { setError('Display name is already taken'); return; }
    if (!termsAgreed || !privacyAgreed) { setError('You must agree to the Terms of Service and Privacy Policy'); return; }

    const answered = selectedQuestions.filter(q => q.questionId > 0 && q.answer.trim());
    if (answered.length < 3) { setError('Please answer at least 3 security questions'); return; }

    if (totpEnabled) {
      if (!totpCode || totpCode.length !== 6) { setError('Please enter a valid 6-digit TOTP code'); return; }
    }

    setLoading(true);
    try {
      await register(username, display, password);

      await fetch(`${API}/auth/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ questions: answered }),
      });

      if (totpEnabled && totpSecret) {
        await fetch(`${API}/auth/totp/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ secret: totpSecret }),
        });
        await fetch(`${API}/auth/totp/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ code: totpCode }),
        });
      }

      navigate('/fiction');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const handleTermsScroll = () => {
    if (termsRef.current) {
      const el = termsRef.current;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) setTermsRead(true);
    }
  };

  const handlePrivacyScroll = () => {
    if (privacyRef.current) {
      const el = privacyRef.current;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) setPrivacyRead(true);
    }
  };

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="auth-header">
          <Link to="/" className="auth-logo">📖 Nocative</Link>
          <h2>{view === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${view === 'login' ? 'active' : ''}`} onClick={() => { setView('login'); setError(''); }}>Login</button>
          <button className={`auth-tab ${view === 'signup' ? 'active' : ''}`} onClick={() => { setView('signup'); setError(''); }}>Sign Up</button>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {view === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Username</label>
              <input className="input" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} placeholder="your_username" required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input className="input" type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="•••••••" required />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Please wait...' : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup}>
            <div className="form-group">
              <label>Username</label>
              <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="your_username" required minLength={3} />
              {usernameStatus === 'checking' && <small className="field-hint checking">Checking...</small>}
              {usernameStatus === 'available' && <small className="field-hint success">✓ Available</small>}
              {usernameStatus === 'taken' && <small className="field-hint error">✗ Already taken</small>}
            </div>

            <div className="form-group">
              <label>Display Name</label>
              <input className="input" value={display} onChange={e => setDisplay(e.target.value)} placeholder="How others see you" required minLength={2} />
              {displayStatus === 'checking' && <small className="field-hint checking">Checking...</small>}
              {displayStatus === 'available' && <small className="field-hint success">✓ Available</small>}
              {displayStatus === 'taken' && <small className="field-hint error">✗ Already taken</small>}
            </div>

            <div className="form-group">
              <label>Password</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 7 characters" required minLength={7} />
            </div>
            <div className="form-group">
              <label>Confirm Password</label>
              <input className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="•••••••" required />
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input type="checkbox" checked={totpEnabled} onChange={e => setTotpEnabled(e.target.checked)} />
                Enable TOTP Two-Factor Authentication (recommended)
              </label>
            </div>

            {totpEnabled && totpSecret && (
              <div className="totp-setup-box">
                <p><strong>Set up TOTP</strong></p>
                <p>Enter this secret into your authenticator app (Google Authenticator, Authy, etc.):</p>
                <div className="totp-secret-box"><code>{totpSecret}</code></div>
                <p>Or scan the QR code:</p>
                <div className="totp-qr">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=otpauth://totp/Nocative:${username}?secret=${totpSecret}&issuer=Nocative`} alt="TOTP QR" />
                </div>
                <p>Then enter the 6-digit code from your app:</p>
                <input className="input" value={totpCode} onChange={e => setTotpCode(e.target.value)} maxLength={6} placeholder="000000" />
              </div>
            )}

            <div className="form-group">
              <label>Security Questions <span className="required">*</span></label>
              <p className="field-hint">Select at least 3 questions and provide answers. These will be used to recover your account.</p>
              {selectedQuestions.map((sq, i) => (
                <div key={i} className="security-question-row">
                  <select className="input" value={sq.questionId} onChange={e => {
                    const newQ = [...selectedQuestions];
                    newQ[i] = { ...newQ[i], questionId: parseInt(e.target.value) };
                    setSelectedQuestions(newQ);
                  }}>
                    <option value={0}>Select a question</option>
                    {allQuestions.map((q: any) => (
                      <option key={q.id} value={q.id}>{q.question}</option>
                    ))}
                  </select>
                  <input className="input" placeholder="Your answer" value={sq.answer} onChange={e => {
                    const newQ = [...selectedQuestions];
                    newQ[i] = { ...newQ[i], answer: e.target.value };
                    setSelectedQuestions(newQ);
                  }} />
                </div>
              ))}
            </div>

            <div className="form-group">
              <div className="terms-agreement">
                <label className="checkbox-label">
                  <input type="checkbox" checked={termsAgreed} onChange={e => setTermsAgreed(e.target.checked)} disabled={!termsRead} />
                  I have read and agree to the <button type="button" className="link-btn" onClick={() => setShowTerms(true)}>Terms of Service</button>
                  {!termsRead && termsAgreed && <span className="required"> (please scroll to read first)</span>}
                </label>
              </div>
              <div className="terms-agreement">
                <label className="checkbox-label">
                  <input type="checkbox" checked={privacyAgreed} onChange={e => setPrivacyAgreed(e.target.checked)} disabled={!privacyRead} />
                  I have read and agree to the <button type="button" className="link-btn" onClick={() => setShowPrivacy(true)}>Privacy Policy</button>
                  {!privacyRead && privacyAgreed && <span className="required"> (please scroll to read first)</span>}
                </label>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}

        {view === 'login' && (
          <div className="auth-forgot">
            <Link to="/security">Forgot password?</Link>
          </div>
        )}
      </div>

      {/* Terms Modal */}
      {showTerms && (
        <div className="modal-overlay" onClick={() => setShowTerms(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Terms of Service</h2>
              <button className="modal-close" onClick={() => setShowTerms(false)}>✕</button>
            </div>
            <div className="modal-body" ref={termsRef} onScroll={handleTermsScroll}>
              <div className="terms-content">
                <h1>Terms of Service</h1>
                <p><em>Effective: Mar 28, 2026</em></p>
                <p>Welcome to Nocative, a content-hosting platform where creators build, showcase, and exchange unique digital content in a protected, secure environment. By using Nocative's Services, you agree to these Terms of Use ("Terms") and accept associated rights and responsibilities. These Terms apply to all users: creators, buyers, registered users, and non-authenticated users.</p>
                <h2>1. Account Registration and Access</h2>
                <p>Users must be 16 or older. No KYC required. Users responsible for account credentials. Creators may delete unsold content and deactivate accounts. Reactivation requires TOTP and security questions.</p>
                <h2>2. Content Ownership</h2>
                <p>Creators retain authorship and intellectual property rights. Creators may delete unsold content.</p>
                <h2>3. Termination</h2>
                <p>Users may deactivate accounts. Nocative may suspend accounts violating Terms.</p>
                <h2>4. Dispute Resolution</h2>
                <p>Users agree to contact Nocative for informal resolution before escalating. Terms governed by applicable laws.</p>
                <h2>5. Updates</h2>
                <p>Nocative may update Terms with 30 days' notice. Continued use constitutes acceptance.</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => { setTermsRead(true); setShowTerms(false); }}>
                I have read and agree
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Modal */}
      {showPrivacy && (
        <div className="modal-overlay" onClick={() => setShowPrivacy(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Privacy Policy</h2>
              <button className="modal-close" onClick={() => setShowPrivacy(false)}>✕</button>
            </div>
            <div className="modal-body" ref={privacyRef} onScroll={handlePrivacyScroll}>
              <div className="terms-content">
                <h1>Privacy Policy</h1>
                <p><em>Effective: May 21, 2025</em></p>
                <p>Nocative, LLC respects your privacy. This policy describes practices with respect to Personal Data collected when you use our Services.</p>
                <h2>1. Personal Data We Collect</h2>
                <p><strong>Account Information:</strong> No email, phone, or address collected. Users must be 16+.</p>
                <p><strong>Communication Information:</strong> If you contact us, we collect your name and message contents.</p>
                <p><strong>Usage Data:</strong> Content viewed, features used, time zone, user agent, device type.</p>
                <p><strong>Cookies:</strong> We use cookies to operate Services and maintain preferences.</p>
                <h2>2. How We Use Personal Data</h2>
                <p>To provide Services, prevent fraud, comply with legal obligations, and aggregate/de-identify for analytics.</p>
                <h2>3. Retention</h2>
                <p>We retain data only as needed to provide Services and comply with legal obligations.</p>
                <h2>4. Security</h2>
                <p>We implement reasonable measures to protect data. No transmission is fully secure.</p>
                <h2>5. Contact</h2>
                <p>Email us via the link on our website or message us on social media.</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => { setPrivacyRead(true); setShowPrivacy(false); }}>
                I have read and agree
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
