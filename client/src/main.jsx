import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const navItems = ['Home', 'Calls', 'Leads', 'Quotes', 'Customers', 'Price Book', 'Calendar', 'Settings'];
const adminSections = ['Accounts list', 'Provisioning failures', 'A2P status', 'Platform metrics', 'Global kill switches', 'Support impersonation placeholder'];

function Shell({ mode }) {
  const isAdmin = mode === 'admin';
  return (
    <main className="app-shell">
      <aside className="rail">
        <div className="wordmark">Off The Clock AI</div>
        {(isAdmin ? adminSections : navItems).map((item) => <a key={item}>{item}</a>)}
      </aside>
      <section className="panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">{isAdmin ? 'ADMIN' : 'DASHBOARD'}</p>
            <h1>{isAdmin ? 'Admin shell' : 'Empty dashboard shell'}</h1>
          </div>
          {!isAdmin && <button className="master-toggle" type="button">Operator OFF</button>}
          {!isAdmin && <div className="meter"><span>PLAN</span><strong>Operator</strong><span>0 / 300 min</span></div>}
        </header>
        <div className="empty-grid">
          {(isAdmin ? adminSections : navItems).map((item) => <article key={item}><p>{item}</p><span>Empty</span></article>)}
        </div>
      </section>
    </main>
  );
}

function App() {
  const path = window.location.pathname;
  if (path === '/admin') return <Shell mode="admin" />;
  return <Shell mode="dashboard" />;
}

createRoot(document.getElementById('root')).render(<App />);
