import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, firebaseConfigured } from '../firebaseClient';

export default function LoginPage({ loading, error, onSignOut }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setFormError(err.code === 'auth/invalid-credential' ? 'Email or password is incorrect.' : (err.message || 'Sign-in failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-mark">⬡</div>
        <p className="eyebrow">ENVIROCHAIN MONITORING</p>
        <h1>Sign in to your dashboard</h1>
        <p className="login-subtitle">Administrators and assigned location users have separate access.</p>
        {!firebaseConfigured ? (
          <div className="login-notice"><strong>Firebase sign-in needs configuration.</strong><span>Set the REACT_APP_FIREBASE_* values in the dashboard .env.local file, then restart the app.</span></div>
        ) : loading ? (
          <div className="login-loading"><span className="mode-dot" /> Checking your account…</div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <label>Email address<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
            {(formError || error) && <div className="login-error">{formError || error}</div>}
            <button className="login-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
          </form>
        )}
        {error && onSignOut && <button className="login-signout" type="button" onClick={onSignOut}>Sign out</button>}
        <div className="login-security"><span className="footer-status-dot" /> Role and place access are checked by the server.</div>
      </section>
    </main>
  );
}
