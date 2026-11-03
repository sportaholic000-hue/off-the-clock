import React, {useState} from 'react';
import {CARRIERS, carrierForwarding} from './carrierForwarding.js';
import {Field, Select} from './ui.jsx';

// Shows the owner's own carrier steps with the receptionist number filled in.
export function CarrierForwarding({country, number, initialCarrier = ''}) {
  const carriers = CARRIERS[country] || CARRIERS.US;
  const [carrier, setCarrier] = useState(initialCarrier);
  const guide = carrier ? carrierForwarding(carrier, number) : null;
  return (
    <div className="carrier-forwarding">
      <Field label="Your mobile carrier" help="Pick the company your business phone is with to see its forwarding steps.">
        <Select value={carrier} onChange={event => setCarrier(event.target.value)}>
          <option value="">Choose your carrier</option>
          {carriers.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </Select>
      </Field>
      {guide && (
        <div className="carrier-steps" aria-live="polite">
          <ul>
            {guide.steps.map(step => (
              <li key={step.label}><strong>{step.label}:</strong> {step.dial ? <>dial <code>{step.dial}</code></> : step.text}</li>
            ))}
          </ul>
          {guide.notes.map(note => <p key={note}>{note}</p>)}
          {guide.help && <p><a href={guide.help.url} target="_blank" rel="noopener noreferrer">{guide.help.label}</a></p>}
        </div>
      )}
    </div>
  );
}
