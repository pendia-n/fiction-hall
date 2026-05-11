import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const API = '/api';

export default function SecuritySettings() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  // If not logged in, show forgot password flow or reactivation
  const [showForgotPassword, setShowForgotPassword] = useState(!user);
  const [showReactivation, setShowReactivation] = useState(false);

  // Forgot password flow
  const [username, setUsername] = useState('');
  const [step, setStep] = useState<'enterUser' | 'verifyQuestions' | 'newPassword'>('enterUser');
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [newPassword, setNewPassword] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [userId, setUserId] = useState<number | null>(null);

  // Reactivation flow
  const [reactUsername, setReactUsername] = useState('');
  const [reactTotpCode, setReactTotpCode] = useState('');
  const [reactQuestions, setReactQuestions] = useState<any[]>([]);
  const [reactAnswers, setReactAnswers] = useState<Record<number, string>>({});
  const [reactStep, setReactStep] = useState<'enterUser' | 'verify' | 'totp'>('enterUser');
  const [reactError, setReactError] = useState('');
  const [reactMessage, setReactMessage] = useState('');

  // Authenticated settings
  const [tab, setTab] = useState<'password' | 'totp' | 'questions'>('totp');

  // TOTP
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpQrUrl, setTotpQrUrl] = useState('');

  // Security questions setup
  const [allQuestions, setAllQuestions] = useState<any[]>([]);
  const [myQuestions, setMyQuestions] = useState<{ questionId: number; answer: string }[]>([]);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setShowForgotPassword(!user);
  }, [user]);

  useEffect(() => {
    if (user && token) {
      fetch(`${API}/auth/totp/status`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setTotpEnabled(d.enabled));

      fetch(`${API}/auth/questions`).then(r => r.json()).then(setAllQuestions);
      fetch(`${API}/auth/questions/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then((data: any[]) => {
          setMyQuestions(data.map((q: any) => ({ questionId: q.question_id, answer: q.answer })));
        });
    }
  }, [user, token]);

  // Forgot password handlers
  const handleForgotPassword = async () => {
    setForgotError('');
    const qRes = await fetch(`${API}/auth/questions/by-username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (!qRes.ok) {
      setForgotError('User not found or no security questions set');
      return;
    }
    const qData = await qRes.json();
    if (!qData.length) {
      setForgotError('No security questions found for this user');
      return;
    }
    setQuestions(qData);
    setStep('verifyQuestions');
  };

  const verifyAnswers = async () => {
    setForgotError('');
    const answersArr = Object.entries(answers).map(([qId, ans]) => ({
      questionId: parseInt(qId), answer: ans,
    }));
    const res = await fetch(`${API}/auth/questions/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, answers: answersArr }),
    });
    if (res.ok) {
      const data = await res.json();
      setUserId(data.userId);
      setStep('newPassword');
    } else {
      setForgotError('Incorrect answers');
    }
  };

  const resetPassword = async () => {
    if (newPassword.length < 7) { setForgotError('Password too short'); return; }
    const res = await fetch(`${API}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, newPassword }),
    });
    if (res.ok) {
      navigate('/auth');
    } else {
      setForgotError('Failed to reset password');
    }
  };

  // Authenticated TOTP handlers
  const setupTotp = async () => {
    const res = await fetch(`${API}/auth/totp/setup`, {
      method: 'POST', headers: authHeaders(token),
    });
    const data = await res.json();
    setTotpSecret(data.secret);
    setTotpQrUrl(data.qrUrl);
  };

  const verifyTotp = async () => {
    setError('');
    const res = await fetch(`${API}/auth/totp/verify`, {
      method: 'POST', headers: authHeaders(token),
      body: JSON.stringify({ code: totpCode }),
    });
    if (res.ok) {
      setTotpEnabled(true);
      setTotpSecret('');
      setMessage('TOTP enabled successfully');
    } else {
      setError('Invalid code');
    }
  };

  const disableTotp = async () => {
    await fetch(`${API}/auth/totp/disable`, {
      method: 'POST', headers: authHeaders(token),
    });
    setTotpEnabled(false);
    setMessage('TOTP disabled');
  };

  const saveQuestions = async () => {
    setError('');
    const res = await fetch(`${API}/auth/questions`, {
      method: 'POST', headers: authHeaders(token),
      body: JSON.stringify({ questions: myQuestions.filter(q => q.answer.trim()) }),
    });
    if (res.ok) setMessage('Security questions saved!');
    else setError('Failed to save questions');
  };

  // Forgot password view (unauthenticated)
  if (showForgotPassword) {
    return (
      <div className="security-page">
        <div className="card">
          <h2>Account Recovery</h2>
          <Link to="/auth" className="back-link">← Back to Login</Link>

          <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
            <button className={`btn btn-sm ${!showReactivation ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setShowReactivation(false); setReactError(''); setForgotError(''); setReactStep('enterUser'); }}>
              Forgot Password
            </button>
            <button className={`btn btn-sm ${showReactivation ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setShowReactivation(true); setReactError(''); setForgotError(''); setStep('enterUser'); }}>
              Reactivate Account
            </button>
          </div>

          {!showReactivation && (
            <>
              {step === 'enterUser' && (
                <div className="security-section">
                  <p>Enter your username to recover your account using security questions.</p>
                  <div className="form-group">
                    <label>Username</label>
                    <input className="input" value={username} onChange={e => setUsername(e.target.value)} />
                  </div>
                  {forgotError && <div className="error-msg">{forgotError}</div>}
                  <button className="btn btn-primary" onClick={handleForgotPassword}>Find Account</button>
                </div>
              )}

              {step === 'verifyQuestions' && (
                <div className="security-section">
                  <h3>Answer your security questions</h3>
                  {questions.filter(q => q.question).map((q: any) => (
                    <div key={q.id} className="form-group">
                      <label>{q.question}</label>
                      <input className="input" value={answers[q.id] || ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} />
                    </div>
                  ))}
                  {forgotError && <div className="error-msg">{forgotError}</div>}
                  <button className="btn btn-primary" onClick={verifyAnswers}>Verify</button>
                </div>
              )}

              {step === 'newPassword' && (
                <div className="security-section">
                  <div className="form-group">
                    <label>New Password (min 7 chars)</label>
                    <input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  </div>
                  {forgotError && <div className="error-msg">{forgotError}</div>}
                  <button className="btn btn-primary" onClick={resetPassword}>Reset Password</button>
                </div>
              )}
            </>
          )}

          {showReactivation && (
            <>
              {reactStep === 'enterUser' && (
                <div className="security-section">
                  <p>Reactivate your deactivated account. You need your username, security questions, and TOTP authenticator app.</p>
                  <div className="form-group">
                    <label>Username</label>
                    <input className="input" value={reactUsername} onChange={e => setReactUsername(e.target.value)} />
                  </div>
                  {reactError && <div className="error-msg">{reactError}</div>}
                  <button className="btn btn-primary" onClick={async () => {
                    setReactError('');
                    const qRes = await fetch(`${API}/auth/questions/by-username`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ username: reactUsername }),
                    });
                    if (!qRes.ok) {
                      setReactError('User not found or no security questions set');
                      return;
                    }
                    const qData = await qRes.json();
                    if (!qData.length) {
                      setReactError('No security questions found');
                      return;
                    }
                    setReactQuestions(qData);
                    setReactStep('verify');
                  }}>Next →</button>
                </div>
              )}

              {reactStep === 'verify' && (
                <div className="security-section">
                  <h3>Answer your security questions</h3>
                  <p>Answer all questions. Question 3 is required for reactivation.</p>
                  {reactQuestions.filter(q => q.question).map((q: any, i: number) => (
                    <div key={q.id} className="form-group">
                      <label>{i + 1}. {q.question}</label>
                      <input className="input" value={reactAnswers[q.id] || ''} onChange={e => setReactAnswers({ ...reactAnswers, [q.id]: e.target.value })} />
                    </div>
                  ))}
                  {reactError && <div className="error-msg">{reactError}</div>}
                  <button className="btn btn-primary" onClick={() => setReactStep('totp')}>Next: Enter TOTP Code →</button>
                </div>
              )}

              {reactStep === 'totp' && (
                <div className="security-section">
                  <h3>Enter TOTP Code</h3>
                  <p>Open your authenticator app and enter the 6-digit code.</p>
                  <div className="form-group">
                    <label>TOTP Code</label>
                    <input className="input" value={reactTotpCode} onChange={e => setReactTotpCode(e.target.value)} maxLength={6} placeholder="000000" />
                  </div>
                  {reactError && <div className="error-msg">{reactError}</div>}
                  {reactMessage && <div className="success-msg">{reactMessage}</div>}
                  <button className="btn btn-primary" onClick={async () => {
                    setReactError('');
                    setReactMessage('');
                    const answersArr = Object.entries(reactAnswers).map(([qId, ans]) => ({
                      questionId: parseInt(qId), answer: ans,
                    }));
                    const res = await fetch(`${API}/auth/reactivate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ username: reactUsername, answers: answersArr, totpCode: reactTotpCode }),
                    });
                    if (res.ok) {
                      setReactMessage('Account reactivated! You can now log in.');
                      setTimeout(() => navigate('/auth'), 2000);
                    } else {
                      const data = await res.json();
                      setReactError(data.error || 'Failed to reactivate');
                    }
                  }}>Reactivate Account</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Authenticated security settings
  return (
    <div className="security-page">
      <div className="card">
        <h2>Security Settings</h2>
        <div className="auth-tabs">
          <button className={`auth-tab ${tab === 'totp' ? 'active' : ''}`} onClick={() => { setTab('totp'); setError(''); setMessage(''); }}>TOTP 2FA</button>
          <button className={`auth-tab ${tab === 'questions' ? 'active' : ''}`} onClick={() => { setTab('questions'); setError(''); setMessage(''); }}>Security Q&A</button>
        </div>

        {error && <div className="error-msg">{error}</div>}
        {message && <div className="success-msg">{message}</div>}

        {tab === 'totp' && (
          <div className="security-section">
            {!totpEnabled && !totpSecret && (
              <>
                <p>Enable two-factor authentication with TOTP (Google Authenticator, Authy, etc.) for extra security.</p>
                <button className="btn btn-primary" onClick={setupTotp}>Set Up TOTP</button>
              </>
            )}
            {totpSecret && (
              <div className="totp-setup">
                <p><strong>Set up TOTP</strong></p>
                <p>Enter this secret into your authenticator app:</p>
                <div className="totp-secret-box"><code>{totpSecret}</code></div>
                <p>Or scan the QR code:</p>
                <div className="totp-qr">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(totpQrUrl)}`} alt="TOTP QR" />
                </div>
                <p>Then enter the 6-digit code from your app:</p>
                <div className="form-group">
                  <input className="input" value={totpCode} onChange={e => setTotpCode(e.target.value)} maxLength={6} placeholder="000000" />
                </div>
                <button className="btn btn-primary" onClick={verifyTotp}>Verify & Enable</button>
              </div>
            )}
            {totpEnabled && (
              <div className="totp-enabled">
                <p>✅ TOTP two-factor authentication is enabled</p>
                <button className="btn btn-danger" onClick={disableTotp}>Disable TOTP</button>
              </div>
            )}
          </div>
        )}

        {tab === 'questions' && (
          <div className="security-section">
            <p>Set up or update security questions to recover your account if you forget your password. At least 3 questions required.</p>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="form-group">
                <select className="input" value={myQuestions[i]?.questionId || ''} onChange={e => {
                  const newQ = [...myQuestions];
                  newQ[i] = { questionId: parseInt(e.target.value), answer: myQuestions[i]?.answer || '' };
                  setMyQuestions(newQ);
                }}>
                  <option value="">Select a question</option>
                  {allQuestions.map((q: any) => (
                    <option key={q.id} value={q.id}>{q.question}</option>
                  ))}
                </select>
                <input className="input" placeholder="Your answer" value={myQuestions[i]?.answer || ''} onChange={e => {
                  const newQ = [...myQuestions];
                  newQ[i] = { questionId: myQuestions[i]?.questionId || 0, answer: e.target.value };
                  setMyQuestions(newQ);
                }} />
              </div>
            ))}
            <button className="btn btn-primary" onClick={saveQuestions}>Save Questions</button>
          </div>
        )}
      </div>
    </div>
  );
}
