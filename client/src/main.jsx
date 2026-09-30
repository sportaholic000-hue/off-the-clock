import {CustomerQuote,QuoteRecords} from './quotedone.jsx';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Shield } from 'lucide-react';
import './styles.css';
import { getToken, getSessionKey, go } from './api.js';
import Dashboard from './dashboard.jsx';
import Onboarding from './onboarding.jsx';
import PriceBook from './pricebook.jsx';
import Billing from './billing.jsx';
import Calendar from './calendar.jsx';
import AccountRecovery from './accountRecovery.jsx';
import { Brand } from './ui.jsx';

function AdminShell() {
  return (
    <main className="admin-shell">
      <Brand />
      <div><Shield size={24} /><p className="eyebrow">ADMIN</p><h1>Platform cockpit</h1><p>Admin surfaces are scheduled for a later phase.</p></div>
    </main>
  );
}

function initialLocation() {
    if (window.location.pathname === '/onboarding' && new URLSearchParams(window.location.search).get('calendar') === 'connected' &&
        sessionStorage.getItem('otc_calendar_return') === 'calendar') {
      sessionStorage.removeItem('otc_calendar_return');
      window.history.replaceState({}, '', '/calendar');
    }
    return {url:window.location.pathname + window.location.search + window.location.hash};
}

function App() {
  const [location, setLocation] = useState(initialLocation);
  useEffect(() => {
    const update = () => setLocation({url:window.location.pathname + window.location.search + window.location.hash});
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    window.addEventListener('otc:session', update);
    const storage=event=>{if(event.key==='otc_token')update();};
    window.addEventListener('storage', storage);
    return () => {window.removeEventListener('popstate', update);window.removeEventListener('hashchange', update);window.removeEventListener('otc:session', update);window.removeEventListener('storage',storage);};
  }, []);

  const path = location.url.split(/[?#]/)[0];
  if (['/forgot-password','/reset-password','/verify-email','/resend-verification','/account/email'].includes(path)) return <AccountRecovery key={location.url} path={path}/>;
  if(path.startsWith('/quote/'))return <CustomerQuote key={path} publicKey={path.slice(7)} persistResult/>;
  if (path === '/admin') return <AdminShell />;
  if (getToken() && ['/settings','/settings/billing'].includes(path)) return <Billing key={getSessionKey()} />;
  if (!getToken() || path === '/onboarding' || path === '/') return <Onboarding key={getSessionKey()} />;
  if(['/leads','/quotes'].includes(path))return <QuoteRecords key={location.url+getSessionKey()} kind={path.slice(1)} recordId={new URLSearchParams(window.location.search).get('record')}/>;
  if (path === '/calendar') return <Calendar key={getSessionKey()} />;
  if (path === '/pricebook') return <PriceBook />;
  if (path === '/dashboard') return <Dashboard />;
  go('/dashboard');
  return null;
}

createRoot(document.getElementById('root')).render(<App />);
