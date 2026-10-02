import { db, ownerQuery } from './db.js';
import { loadBillingConfig } from './billingConfig.js';
import { createCallUsageService } from './callUsageService.js';

// Shared server-only instance. Importing it does not expose an HTTP ingestion
// endpoint, a model tool, a client-controlled meter, or any provider credential.
// The server runs migrations before invoking any service method.
export const callUsageService = createCallUsageService({ database: db, ownerQuery, usageConfig: loadBillingConfig().usage || null });
export const recordCompletedCall = input => callUsageService.recordCompletedCall(input);
export const getCallAllowanceDecision = (tenantOwnerId, options) => callUsageService.getCallAllowanceDecision(tenantOwnerId, options);
