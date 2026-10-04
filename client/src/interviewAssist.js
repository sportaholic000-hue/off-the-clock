// An AI reading belongs to the exact question and on-screen value it was asked
// about. If the owner edited that value or moved to another question while the
// request was pending, the newer entry is kept and the reading is not applied.
export function sameAssistTarget(asked, now) {
  return Boolean(asked && now) && asked.serviceType === now.serviceType && asked.field === now.field && Object.is(asked.rawValue, now.rawValue);
}
export const STALE_ASSIST_NOTICE = 'Your newer entry was kept. The AI reading arrived after you changed this answer, so it was not applied. Ask again to use it.';
export const STALE_CONFIRM_NOTICE = 'The value you read back was saved. You changed this answer while it was saving, so your new entry is still here: read it back and confirm it to replace the saved value.';
