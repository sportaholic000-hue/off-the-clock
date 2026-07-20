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
  const [location, setLocation] = useState(window.location.pathname + window.location.search);
  useEffect(() => {
    const update = () => setLocation(window.location.pathname + window.location.search);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  const path = location.split('?')[0];
  if (path === '/admin') return <AdminShell />;
  if (!getToken() || path === '/onboarding' || path === '/') return <Onboarding />;
  if (path === '/pricebook') return <PriceBook />;
  if (path === '/dashboard') return <Dashboard />;
  go('/dashboard');
  return null;
}

createRoot(document.getElementById('root')).render(<App />);
