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
          <Link to="/" className="auth-logo">📖 Fiction Hall</Link>
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
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=otpauth://totp/Fiction+Hall:${username}?secret=${totpSecret}&issuer=Fiction+Hall`} alt="TOTP QR" />
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
                <p>Welcome to Fiction Hall, a content-hosting platform where creators build, showcase, and exchange unique digital content in a protected, secure environment. By using Fiction Hall's Services, you agree to these Terms of Use ("Terms") and accept associated rights and responsibilities. These Terms apply to all users: creators, buyers, registered users, and non-authenticated users.</p>
                <h2>1. Account Registration and Access</h2>
                <p><strong>1.1 General Browsing Access:</strong> The public may browse Fiction Hall-hosted content after authentication. Registration is required to create, purchase, or interact with content.</p>
                <p><strong>1.2 Age Requirement:</strong> Users must be 16 or older, per the Children's Online Privacy Protection Act (COPPA). Users under 16 are prohibited from registering or using Fiction Hall's Services. We recommend users under 18 seek parental guidance for safe usage and income management.</p>
                <p><strong>1.3 Registration Requirements:</strong> No Know-Your-Customer (KYC) verification is required for registration. Users need not provide real names or addresses. Optional KYC is available to gain Verified Seller status, enhancing credibility.</p>
                <p><strong>1.4 Account Security and Deactivation:</strong> Users are responsible for protecting account credentials. Creators may delete unsold content and deactivate accounts without full deletion.</p>
                <p><strong>1.5 Reactivate Deactivated Account:</strong> Users are required to have Time-based OTP code enabled. Only if security questions are verified can a deactivated account be restored.</p>
                <p><strong>1.6 Acceptance of Terms:</strong> By registering an account, you confirm that you have read, understood, and agree to be bound by these Terms. These Terms constitute a legally binding agreement between you and Fiction Hall.</p>
                <h2>2. Content Ownership, Authorship, and Intellectual Property</h2>
                <p><strong>2.1 User-Created Content:</strong> Creators retain authorship and intellectual property rights for their content, securing recognition and protection even after sale.</p>
                <p><strong>2.2 Content Deletion by Creator:</strong> Creators may delete unsold content. Fiction Hall ceases protecting intellectual property of deleted content.</p>
                <p><strong>2.3 Prohibition on Copying and Reproduction:</strong> All content on Fiction Hall — whether draft or published, free or premium — is the intellectual property of its respective creator. You may not copy, reproduce, download (except where explicitly permitted), redistribute, republish, or create derivative works from any content without the express written consent of the content owner. This prohibition applies to all forms of copying including but not limited to: manual transcription, automated scraping, screenshotting for redistribution, and use of OCR or other extraction tools. Violations may result in immediate account termination and legal action.</p>
                <p><strong>2.4 Personal Use Only:</strong> Purchased or rented access grants you a personal, non-transferable, non-exclusive license to view the content for your own private use. You may not share, lend, resell, or otherwise make the content available to any third party.</p>
                <h2>3. Termination and Account Suspension</h2>
                <p><strong>3.1 User-Initiated Termination:</strong> Users may deactivate accounts, retaining historical access as needed.</p>
                <p><strong>3.2 Fiction Hall's Right to Suspend or Terminate Accounts:</strong> Fiction Hall may suspend/remove content or accounts violating Terms, infringing rights, or contravening laws/guidelines. Users who violate the copying and reproduction policy (Section 2.3) are subject to immediate account termination without refund.</p>
                <h2>4. Dispute Resolution and Governing Law</h2>
                <p><strong>4.1 Informal Resolution:</strong> Users agree to contact Fiction Hall for informal dispute resolution before escalating.</p>
                <p><strong>4.2 Governing Law:</strong> Terms are governed by applicable laws in your region (e.g., New Mexico/Wyoming for U.S. users).</p>
                <p><strong>4.3 Audit Rights:</strong> Pendia LLC may request documentation (e.g., analytics, sales records) to verify compliance with license terms within 7 days of request. KYC-verified users must provide requested data. Failure to comply may result in termination of license's validity.</p>
                <h2>5. DMCA and Copyright Infringement</h2>
                <p><strong>5.1 DMCA Policy:</strong> Fiction Hall respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act of 1998 ("DMCA"), we will respond expeditiously to claims of copyright infringement committed using the Fiction Hall service.</p>
                <p><strong>5.2 Filing a DMCA Notice:</strong> If you believe that your copyrighted work has been copied and is accessible on Fiction Hall in a way that constitutes copyright infringement, you may submit a written notification to our designated copyright agent containing:</p>
                <ul>
                  <li>A physical or electronic signature of the copyright owner or a person authorized to act on their behalf</li>
                  <li>Identification of the copyrighted work claimed to have been infringed</li>
                  <li>Identification of the material that is claimed to be infringing and information reasonably sufficient to permit Fiction Hall to locate the material (e.g., the URL of the page)</li>
                  <li>Your contact information (address, telephone number, and email address)</li>
                  <li>A statement that you have a good faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law</li>
                  <li>A statement, made under penalty of perjury, that the above information is accurate and that you are the copyright owner or authorized to act on behalf of the owner</li>
                </ul>
                <p><strong>5.3 DMCA Counter-Notice:</strong> If you believe that your content was removed or disabled by mistake or misidentification, you may submit a written counter-notice containing:</p>
                <ul>
                  <li>Your physical or electronic signature</li>
                  <li>Identification of the material that has been removed or to which access has been disabled, and the location at which the material appeared before it was removed or access has been disabled</li>
                  <li>A statement under penalty of perjury that you have a good faith belief that the material was removed or disabled as a result of mistake or misidentification</li>
                  <li>Your name, address, telephone number, and a statement that you consent to the jurisdiction of the federal court for the judicial district in which your address is located</li>
                </ul>
                <p><strong>5.4 Repeat Infringers:</strong> Fiction Hall will, in appropriate circumstances, terminate the accounts of users who are repeat copyright infringers. A user who has had content removed due to a valid DMCA notice on three (3) or more separate occasions will have their account permanently terminated.</p>
                <p><strong>5.5 Designated Copyright Agent:</strong> DMCA notices and counter-notices should be sent to: Pendia LLC, Copyright Agent, via the contact link on the Fiction Hall website.</p>
                <h2>6. Updates to These Terms</h2>
                <p><strong>6.1 Changes to Terms:</strong> Fiction Hall may update Terms to reflect service improvements, regulatory changes, or security enhancements, with 30 days' notice for material changes.</p>
                <p><strong>6.2 Acceptance of Updated Terms:</strong> Continued use post-update signifies acceptance. Material changes will be notified via email or prominent notice on the platform.</p>
                <p>Thank you for joining the Fiction Hall community. We're committed to a safe, secure, and creative environment honoring your rights and work.</p>
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
                <p>Pendia, LLC respects your privacy. This policy describes practices with respect to Personal Data collected when you use our Services.</p>
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
