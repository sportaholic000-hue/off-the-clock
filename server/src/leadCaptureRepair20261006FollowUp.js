import {storedObject,storedLeadView,storedQuoteView} from './ownerRecordViews.js';

export function leadFollowUpView(ownerQuery,row,role) {
  const submission=ownerQuery(`SELECT originalSubmissionJson FROM quoteSubmissions
    WHERE ownerId=? AND recordId=? ORDER BY createdAt DESC,rowid DESC LIMIT 1`).get(row.ownerId,row.id);
  const preferred=ownerQuery(`SELECT p.id,p.status,p.customerJson,p.locationJson,p.createdAt
    FROM bookingPreferences p JOIN bookingIntents i ON i.ownerId=p.ownerId AND i.id=p.intentId
    WHERE p.ownerId=? AND i.sourceId=? AND i.sourceType IN ('lead','quote')
    ORDER BY p.createdAt DESC,p.rowid DESC LIMIT 1`).get(row.ownerId,row.id);
  return storedLeadView(row,role,submission?storedObject(submission.originalSubmissionJson):undefined,preferred);
}

export function quoteFollowUpView(ownerQuery,row,role) {
  const submission=ownerQuery(`SELECT originalSubmissionJson FROM quoteSubmissions
    WHERE ownerId=? AND recordId=? ORDER BY createdAt DESC,rowid DESC LIMIT 1`).get(row.ownerId,row.id);
  return storedQuoteView(row,role,submission?storedObject(submission.originalSubmissionJson):undefined);
}
