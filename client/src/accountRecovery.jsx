import React, {useEffect, useState} from 'react';
import {api, getToken, go, setToken} from './api.js';
import {Brand, Button, ErrorMessage, Field, Loading, Notice, TextInput} from './ui.jsx';
import './accountRecovery.css';

function initialLinkToken() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
  window.history.replaceState({}, '', window.location.pathname + window.location.search);
  return /^[A-Za-z0-9_-]{43,86}$/.test(token) ? token : '';
}

export function VerificationNotice({initialDelivery = null, showVerified = false}) {
  const [account, setAccount] = useState(null), [error, setError] = useState(null);
  const [busy, setBusy] = useState(false), [delivery, setDelivery] = useState(initialDelivery);
  async function refresh() {
    try { setAccount(await api('/api/auth/account')); setError(null); } catch (next) { setError(next); }
  }
  useEffect(() => {refresh();}, []);
  async function resend() {
    setBusy(true); setError(null);
    try {
      const result = await api('/api/auth/account/resend-verification', {method: 'POST', body: {}});
      setDelivery(result.verificationDelivery); await refresh();
    } catch (next) {setError(next);} finally {setBusy(false);}
  }
  if (account?.emailVerifiedAt) return showVerified ? <Notice tone="success" title="Email verified">Your account email is verified.</Notice> : null;
  return <section className="email-verification-notice" aria-label="Email verification">
    {!account && !error ? <Loading label="Checking account email"/> : account && <Notice title="Verify your email">
      <p>Check the inbox for {account.email}, or request another verification link.</p>
      {delivery?.status === 'retry_needed' && <p>Your account was created, but the email could not be sent. Request another link.</p>}
      {delivery?.status === 'accepted' && <p>The email provider accepted your verification email. Check your inbox and spam folder.</p>}
      {delivery?.status === 'simulated' && <p>Email delivery is simulated in this development environment.</p>}
      <Button variant="secondary" disabled={busy} onClick={resend}>{busy ? 'Requesting…' : 'Resend verification email'}</Button>
      <Button variant="secondary" onClick={refresh}>Check verification status</Button>
    </Notice>}
    <ErrorMessage error={error}/>
  </section>;
}

const TITLES = {'/forgot-password':'Forgot password', '/resend-verification':'Request a verification email',
  '/reset-password':'Reset password', '/verify-email':'Verify your email', '/account/email':'Account email'};

export default function AccountRecovery({path}) {
  const [token] = useState(initialLinkToken);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [done, setDone] = useState(false);
  const request = ['/forgot-password', '/resend-verification'].includes(path);
  const reset = path === '/reset-password', verify = path === '/verify-email';
  async function submit(event) {
    event.preventDefault(); setError(null); setBusy(true);
    try {
      if ((reset || verify) && !token) throw Error('This link is invalid or has expired. Request a new one.');
      if (reset && password !== confirmation) throw Error('The passwords do not match.');
      await api(request ? '/api/auth' + path : verify ? '/api/auth/verify-email' : '/api/auth/reset-password',
        {method: 'POST', auth: false, body: request ? {email} : reset ? {token, password} : {token}});
      if (reset) setToken(null);
      setDone(true); setPassword(''); setConfirmation('');
    } catch (next) {setError(next);} finally {setBusy(false);}
  }
  function signIn() {setToken(null);go('/onboarding?mode=login');}
  return <main className="account-recovery"><Brand/><h1>{TITLES[path]}</h1>
    {path === '/account/email' ? getToken() ? <VerificationNotice showVerified/> : <Notice>Sign in to check your account email.</Notice> :
      done ? <div role="status"><Notice tone="success">
        {request ? 'Request received. If this account needs an email, we will attempt to send a new link. Check your inbox and spam folder.' :
          reset ? 'Your password has been reset. Sign in with your new password.' : 'Your email is verified.'}
      </Notice></div> : <form className="auth-form" onSubmit={submit}>
        {request && <Field label="Email"><TextInput type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)}/></Field>}
        {(reset || verify) && !token && <Notice>This link is invalid or has expired. Request a new one.</Notice>}
        {verify && token && <p>Confirm to verify the account email associated with this link.</p>}
        {reset && token && <>
          <Field label="New password"><TextInput type="password" autoComplete="new-password" minLength="8" maxLength="1024" required value={password} onChange={event => setPassword(event.target.value)}/></Field>
          <Field label="Confirm new password"><TextInput type="password" autoComplete="new-password" minLength="8" maxLength="1024" required value={confirmation} onChange={event => setConfirmation(event.target.value)}/></Field>
        </>}
        <ErrorMessage error={error}/>
        <Button type="submit" disabled={busy || ((reset || verify) && !token)}>{busy ? 'Working…' : request ? 'Request email' : reset ? 'Reset password' : 'Verify email'}</Button>
      </form>}
    <div className="account-actions">
      {(reset || path === '/forgot-password') && <Button variant="secondary" onClick={() => go('/forgot-password')}>Request a new reset link</Button>}
      {verify && <Button variant="secondary" onClick={() => go('/resend-verification')}>Request a new verification link</Button>}
      {getToken() && !reset && <Button onClick={() => go('/onboarding')}>Continue setup</Button>}
      <Button variant="secondary" onClick={signIn}>Back to sign in</Button>
    </div>
  </main>;
}
