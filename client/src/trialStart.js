// A new owner (no trial started yet) goes from sign-in to checkout, and back to
// setup step 2 once Stripe confirms the card. Checkout leaves the app, so the
// owner who opened it is remembered for this tab only, tied to the session.
const TRIAL_CHECKOUT_KEY='otc_trial_checkout';
export const TRIAL_CONFIRM_ATTEMPTS=30;
export const TRIAL_CONFIRM_INTERVAL_MS=2000;

export function markTrialCheckout(sessionKey){
  try{sessionStorage.setItem(TRIAL_CHECKOUT_KEY,String(sessionKey));}catch{/* The return still works from the checkout=success address. */}
}
export function trialCheckoutPending(sessionKey){
  try{return sessionStorage.getItem(TRIAL_CHECKOUT_KEY)===String(sessionKey);}catch{return false;}
}
export function clearTrialCheckout(){
  try{sessionStorage.removeItem(TRIAL_CHECKOUT_KEY);}catch{/* Nothing stored. */}
}
export function checkoutReturned(){
  return new URLSearchParams(window.location.search).get('checkout')==='success';
}

// Shown on the setup screen and the Dashboard to an owner who has not started a trial.
export const START_TRIAL_DESCRIPTION='Choose your plan and add a card to start your 14-day trial. Setup continues with your business type after checkout.';
