import test from 'node:test';
import assert from 'node:assert/strict';
import {demoInstructions} from '../server/src/demo/demoInstructions.js';
import {exportDefinition} from '../server/src/integrationData.js';
import {readFileSync} from 'node:fs';

// The demo said webhooks send "each new call" and that owners can download calls as
// CSV. Webhooks send new leads, quote requests and bookings; the CSV exports are
// leads, quote requests and bookings.
// HANDWRITTEN EXPECTATIONS, before execution: the demo names exactly those three for
// both; the export kinds are leads, quote-requests and bookings, and there is no calls
// export; the webhook events are lead.created, quote.requested and appointment.booked.
test('demo facts: webhooks and CSV name only what the product sends and exports',()=>{
  const text=demoInstructions('Nova');
  assert.match(text,/webhooks can automatically send each new lead, quote request and booking to another system the owner uses\. Any owner can download their leads, quote requests and bookings as a spreadsheet \(CSV\)\./);
  assert.doesNotMatch(text,/each new call|leads, quotes, calls and bookings/);
  for(const kind of ['leads','quote-requests','bookings'])assert.ok(exportDefinition(kind),kind);
  for(const kind of ['calls','quotes'])assert.equal(exportDefinition(kind),null,kind);
  const webhook=readFileSync(new URL('../server/src/outboundWebhookService.js',import.meta.url),'utf8');
  assert.match(webhook,/\{'lead\.created':'leadsEnabled','quote\.requested':'quotesEnabled','appointment\.booked':'bookingsEnabled'\}/);
});
