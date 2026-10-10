// Owner ruling, 2026-10-09. Wording is proposed, pending owner approval.
export const PLAN_DESCRIPTIONS=Object.freeze({
  Starter:'$69/month or $690/year. 150 included minutes each billing month. Your receptionist answers 24/7 on your number, answers from your business information and listed prices, and captures caller requests with transcripts and summaries. Owner email alerts, spam filtering, one number and one owner login. No calendar booking, live transfer, price book, website widget or phone price-book quoting.',
  Operator:'$119/month or $1,190/year. 300 included minutes each billing month. Everything in Starter, plus calendar booking, live transfer, the price book with AI setup, and the website quote widget. Phone price-book quoting is not included.',
  QuoteDone:'$279/month or $2,790/year. 1,200 included minutes each billing month. Everything in Operator, plus price-book quoting on the phone.'
});
export const PRICE_BOOK_UNAVAILABLE='The price book and website widget require Operator or QuoteDone. Your saved data is kept.';
export const BOOKING_UNAVAILABLE='Calendar booking and live transfer require Operator or QuoteDone. Your saved settings and bookings are kept.';
export const DOWNGRADE_EXPLANATION='Changing to Starter turns off the price book, website widget, calendar booking and live transfer. Your price book, widget settings, calendar connection and existing bookings are kept. Existing appointments are not canceled. Changing from QuoteDone to Operator turns off phone price-book quoting; the website widget, price book, calendar booking and live transfer stay available. Features switch when your confirmed plan changes. Upgrading restores access to saved settings.';
