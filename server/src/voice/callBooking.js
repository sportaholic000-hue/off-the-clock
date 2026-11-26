import {resolveBookingCapability} from '../bookingCapabilities.js';
import {serviceAreaFromKnowledgeBase} from '../serviceArea.js';

// Whether a phone call can book through the business calendar: at least one
// enabled booking policy resolves to DIRECT, by the same rule the voice booking
// tools use (resolveBookingCapability: Google calendar, booking hours and
// service area all set up). Otherwise, Calendly link or incomplete setup, the
// receptionist takes preferred times for the business instead (platform spec,
// onboarding step 8). `query` is an owner-bound query helper (ownerQuery or
// usageOwnerQuery(database)).
export function callBookingAvailable(query, ownerId) {
  const settings = query('SELECT * FROM bookingSettings WHERE ownerId = ?').get(ownerId);
  if (!settings) return false;
  const policies = query('SELECT * FROM bookingPolicies WHERE ownerId = ? AND enabled = 1').all(ownerId);
  if (!policies.length) return false;
  const profile = query('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId = ?').get(ownerId);
  const serviceArea = serviceAreaFromKnowledgeBase(profile?.knowledgeBaseJson);
  return policies.some(policy => resolveBookingCapability({settings, policy, serviceArea}) === 'DIRECT');
}
