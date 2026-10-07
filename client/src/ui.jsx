import React, {useState} from 'react';
import {
  BookOpen, CalendarDays, ChevronRight, Clock3, LayoutDashboard,
  LogOut, PhoneCall, Settings, Sparkles
} from 'lucide-react';
import { go, logout } from './api.js';

const NAV = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Calls', path: '/calls', icon: PhoneCall },
  { label: 'Reports', path: '/reports', icon: LayoutDashboard },
  { label: 'Leads', path: '/leads', icon: BookOpen },
  { label: 'Quotes', path: '/quotes', icon: BookOpen },
  { label: 'Price Book', path: '/pricebook', icon: BookOpen },
  { label: 'Onboarding', path: '/onboarding', icon: Sparkles },
  { label: 'Calendar', path: '/calendar', icon: CalendarDays },
  { label: 'Settings', path: '/settings', icon: Settings }
];

export function Brand() {
  return (
    <button className="brand" type="button" onClick={() => go('/dashboard')}>
      <Clock3 size={18} aria-hidden="true" />
      <span>Off The Clock AI</span>
    </button>
  );
}

export function Button({ children, icon: Icon, variant = 'primary', className = '', ...props }) {
  return (
    <button className={`button button-${variant} ${className}`} type="button" {...props}>
      {Icon && <Icon size={16} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

export function StatusChip({ status, pending = false }) {
  const live = status === 'QUOTING LIVE' || status === 'OPERATOR LIVE' || status === 'LIVE';
  // CHECKING is a genuinely unknown state before the first validation returns.
  // It must not be styled or worded as a failure.
  const checking = status === 'CHECKING';
  const tone = checking ? 'status-checking' : live ? 'status-live' : 'status-need';
  return (
    <span className={`status-chip ${tone}${pending ? ' status-pending' : ''}`}>
      {checking ? 'CHECKING' : status}
    </span>
  );
}

export function AppShell({ activePath, children, operator }) {
  const [signingOut,setSigningOut]=useState(false),[signoutError,setSignoutError]=useState('');
  async function signOut(){if(signingOut)return;setSigningOut(true);setSignoutError('');try{await logout();go('/');}catch(error){setSignoutError(error.message);setSigningOut(false);}}
  return (
    <div className="app-shell">
      <aside className="side-rail">
        <Brand />
        <nav className="side-nav" aria-label="Primary">
          {NAV.map(item => {
            const Icon = item.icon;
            const active = activePath === item.path.split('?')[0];
            return (
              <button key={item.path} className={active ? 'nav-item active' : 'nav-item'} type="button" onClick={() => go(item.path)}>
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button
          className="nav-item signout"
          type="button"
          disabled={signingOut}
          onClick={signOut}
        >
          <LogOut size={16} aria-hidden="true" />
          <span>{signingOut?'Signing out…':'Sign out'}</span>
        </button>
        {signoutError&&<p role="alert">{signoutError}</p>}
      </aside>
      <div className="workspace">
        <header className="mobile-header">
          <Brand />
          <Select aria-label="Go to page" value={activePath || '/dashboard'} onChange={event => go(event.target.value)}>
            {NAV.map(item => <option value={item.path} key={item.path}>{item.label}</option>)}
          </Select>
          <Button variant="secondary" disabled={signingOut} onClick={signOut}>{signingOut?'Signing out…':'Sign out'}</Button>
          {signoutError&&<p role="alert">{signoutError}</p>}
          {operator && <StatusChip status={operator.simulated ? 'SIMULATED PREVIEW' : operator.enabled ? 'OPERATOR LIVE' : 'OPERATOR OFF'} />}
        </header>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}

export function Field({ label, help, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {help && <span className="field-help">{help}</span>}
      {children}
    </label>
  );
}

export function TextInput(props) {
  return <input className="input" {...props} />;
}

export function Textarea(props) {
  return <textarea className="textarea" {...props} />;
}

export function Select(props) {
  return <select className="input select" {...props} />;
}

export function Toggle({ checked, onChange, label, sublabel, disabled = false }) {
  return (
    <button
      className={`toggle-control ${checked ? 'on' : 'off'}`}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-track"><span className="toggle-knob" /></span>
      {(label || sublabel) && (
        <span className="toggle-copy">
          {label && <strong>{label}</strong>}
          {sublabel && <small>{sublabel}</small>}
        </span>
      )}
    </button>
  );
}

export function Notice({ tone = 'neutral', title, children }) {
  return (
    <div className={`notice notice-${tone}`}>
      {title && <strong>{title}</strong>}
      <span>{children}</span>
    </div>
  );
}

export function StepActions({ onBack, onNext, nextLabel = 'Continue', nextDisabled = false }) {
  return (
    <div className="step-actions">
      {onBack ? <Button variant="secondary" onClick={onBack}>Back</Button> : <span />}
      <Button onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
        <ChevronRight size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}

export function Loading({ label = 'Loading' }) {
  return <div className="loading mono">{label}</div>;
}

export function ErrorMessage({ error }) {
  if (!error) return null;
  return <Notice tone="error">{error.message || String(error)}</Notice>;
}

export function PhonePreviewButton({ onClick, children }) {
  return <Button icon={PhoneCall} variant="secondary" onClick={onClick}>{children}</Button>;
}
