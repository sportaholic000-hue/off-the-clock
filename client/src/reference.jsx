import React, { useState } from 'react';
import { AlertTriangle, ChevronRight, RotateCcw } from 'lucide-react';

// Components translated from the committed Fable design references in
// design-reference/. Class names map to styles.css; see the reference files
// for the authoritative visual treatment.

// --- Disclosure -------------------------------------------------------------
// Reference: design-reference/pricebook-editor/index.html `.disclose`
// summary = title + muted subtitle + right-side status chip + caret.
// A blocker inside a collapsed region MUST surface in the summary chip, so a
// collapsed section can never hide a blocker.
export function Disclosure({
  title, subtitle, summaryChip, blockerCount = 0, defaultOpen = false,
  children, onJumpToBlocker
}) {
  const [open, setOpen] = useState(defaultOpen || blockerCount > 0);
  const hasBlockers = blockerCount > 0;
  return (
    <section className={`disclose${open ? ' open' : ''}${hasBlockers ? ' has-blockers' : ''}`}>
      <button
        type="button"
        className="disclose-summary"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span className="disclose-heading">
          <span className="disclose-title">{title}</span>
          {subtitle && <span className="disclose-subtitle">{subtitle}</span>}
        </span>
        <span className="disclose-meta">
          {hasBlockers && (
            <span className="chip chip-need blocker-chip">
              <AlertTriangle size={11} aria-hidden="true" />
              {blockerCount} {blockerCount === 1 ? 'price needed' : 'prices needed'}
            </span>
          )}
          {!hasBlockers && summaryChip && <span className="chip chip-quiet">{summaryChip}</span>}
          <span className="caret" aria-hidden="true">▸</span>
        </span>
      </button>
      {hasBlockers && !open && onJumpToBlocker && (
        <button type="button" className="disclose-jump" onClick={onJumpToBlocker}>
          Go to the missing prices
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      )}
      {open && <div className="disclose-body">{children}</div>}
    </section>
  );
}

// --- Counter card -----------------------------------------------------------
// Reference: design-reference/dashboard-live/index.html `.counters`
export function CounterCard({ label, value, unit, detail, accent = false, empty = false }) {
  return (
    <div className="counter-card">
      <span className="counter-label mono">{label}</span>
      <span className={`counter-value mono${accent ? ' accent' : ''}${empty ? ' empty' : ''}`}>
        {value}
        {unit && <span className="counter-unit"> {unit}</span>}
      </span>
      {detail && <span className="counter-detail mono">{detail}</span>}
    </div>
  );
}

// --- Blocker checklist ------------------------------------------------------
// Replaces the rejected semicolon-joined paragraph. One requirement per row,
// contractor-facing language, direct navigation to the affected control.
export function BlockerChecklist({ items = [], onNavigate, emptyLabel = 'Everything needed is priced.' }) {
  if (!items.length) {
    return <p className="checklist-empty">{emptyLabel}</p>;
  }
  return (
    <ul className="blocker-checklist">
      {items.map(item => (
        <li key={`${item.serviceType || ''}-${item.field}`}>
          <button
            type="button"
            className="blocker-row"
            onClick={() => onNavigate && onNavigate(item)}
            disabled={!onNavigate}
          >
            <span className="blocker-marker" aria-hidden="true" />
            <span className="blocker-copy">
              <span className="blocker-title">{item.label}</span>
              {item.service && <span className="blocker-service">{item.service}</span>}
            </span>
            <span className="blocker-tail">
              <span className={`chip ${item.required === false ? 'chip-quiet' : 'chip-need'}`}>
                {item.required === false ? 'OPTIONAL' : 'REQUIRED'}
              </span>
              {onNavigate && <ChevronRight size={14} aria-hidden="true" />}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// --- Class 2 assumption row -------------------------------------------------
// Quantity assumptions are visually secondary to direct owner pricing and are
// never presented as bare multipliers.
export function AssumptionRow({
  label, explanation, unit, value, defaultValue, overridden, onChange, onReset
}) {
  return (
    <div className={`assumption-row${overridden ? ' overridden' : ''}`}>
      <div className="assumption-head">
        <span className="assumption-label">{label}</span>
        <span className="assumption-state">
          {overridden ? (
            <>
              <span className="chip chip-quiet">CHANGED FROM DEFAULT</span>
              <button type="button" className="reset-button" onClick={onReset}>
                <RotateCcw size={11} aria-hidden="true" /> Reset
              </button>
            </>
          ) : (
            <span className="chip chip-quiet">USING DEFAULT</span>
          )}
        </span>
      </div>
      {explanation && <p className="assumption-explanation">{explanation}</p>}
      <div className="assumption-control">
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          aria-label={label}
          value={value ?? ''}
          onChange={event => onChange && onChange(event.target.value)}
        />
        <span className="assumption-unit mono">{unit}</span>
        <span className="assumption-default mono">Default {defaultValue}</span>
      </div>
    </div>
  );
}

// --- Simulated preview banner -----------------------------------------------
// Never suppressible. Every simulated surface must carry it.
export function SimulatedBanner({ children }) {
  return (
    <div className="simulated-banner" role="status">
      <span className="simulated-dot" aria-hidden="true" />
      <span className="simulated-copy">
        <strong className="mono">SIMULATED PREVIEW · NOT A REAL CONNECTION</strong>
        <span>{children || 'No phone number is provisioned, no calls are routed, and the real operator remains off. Production eligibility is unchanged.'}</span>
      </span>
    </div>
  );
}
