import {CustomerQuote,QuoteRecords} from './quotedone.jsx';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Shield } from 'lucide-react';
import './styles.css';
import { getToken, go } from './api.js';
import Dashboard from './dashboard.jsx';
import Onboarding from './onboarding.jsx';
import PriceBook from './pricebook.jsx';
import { Brand } from './ui.jsx';

function AdminShell() {
  return (
    <main className="admin-shell">
      <Brand />
      <div><Shield size={24} /><p className="eyebrow">ADMIN</p><h1>Platform cockpit</h1><p>Admin surfaces are scheduled for a later phase.</p></div>
    </main>
  );
}

function App() {
  const [location, setLocation] = useState({url:window.location.pathname + window.location.search});
  useEffect(() => {
    const update = () => setLocation({url:window.location.pathname + window.location.search});
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  const path = location.url.split('?')[0];
  if(path.startsWith('/quote/'))return <CustomerQuote key={path} publicKey={path.slice(7)}/>;
  if (path === '/admin') return <AdminShell />;
  if (!getToken() || path === '/onboarding' || path === '/') return <Onboarding key={getToken()||'signed-out'} />;
  if(['/leads','/quotes'].includes(path))return <QuoteRecords key={path+getToken()} kind={path.slice(1)}/>;
  if (path === '/pricebook') return <PriceBook />;
  if (path === '/dashboard') return <Dashboard />;
  go('/dashboard');
  return null;
}

createRoot(document.getElementById('root')).render(<App />);
