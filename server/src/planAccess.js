// QuoteDone/price-book access is decided by PLAN, never by planStatus.
// A trial "of any tier" is a trial of THAT tier (platform_spec STEP 1):
// an Operator trial is still Operator and gets the visible-but-locked
// teaser (spec 6.3). planStatus never widens plan access.
export function hasQuoteDoneAccess(account) {
  return Boolean(account && ['QuoteDone', 'Scale'].includes(account.plan));
}
