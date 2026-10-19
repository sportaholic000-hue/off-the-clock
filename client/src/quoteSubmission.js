// These responses definitively reject this submission. A transport failure,
// server failure, or temporary rate limit keeps the immutable request for retry.
export const submissionCanBeEdited = status => [400,401,403,404,409,413,415,422].includes(status);
export const submissionTooLarge = submission => new TextEncoder().encode(JSON.stringify(submission)).length > 1024 * 1024;

// The first mounted form retains the existing recovery key. Further forms for
// the same key get their own slots, restored in the same mount order on reload.
// Claim in an effect, never during render (which React may abandon or repeat).
const submissionCaches = new Map();
export function claimSubmissionCache(baseKey) {
 const slots=submissionCaches.get(baseKey)||new Set();
 let slot=0;while(slots.has(slot))slot++;
 slots.add(slot);submissionCaches.set(baseKey,slots);
 let released=false;
 return {key:slot===0?baseKey:baseKey+':instance:'+slot,release(){
  if(released)return;released=true;slots.delete(slot);
  if(!slots.size)submissionCaches.delete(baseKey);
 }};
}
