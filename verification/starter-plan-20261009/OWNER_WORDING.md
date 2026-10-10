# Proposed, pending owner approval

All wording below is implemented for review; it has not received separate wording approval.
The prices and entitlements implement the owner's October 9 ruling.

## Plan labels and descriptions (signup and billing)

- **Starter**
- **Operator** (existing label, now also offered for price-book/widget access)
- **QuoteDone** (existing label)
- **Plan features**
- **Starter:** “$69/month or $690/year. 150 included minutes each billing month. Your receptionist answers 24/7 on your number, answers from your business information and listed prices, and captures caller requests with transcripts and summaries. Owner email alerts, spam filtering, one number and one owner login. No calendar booking, live transfer, price book, website widget or phone price-book quoting.”
- **Operator:** “$119/month or $1,190/year. 300 included minutes each billing month. Everything in Starter, plus calendar booking, live transfer, the price book with AI setup, and the website quote widget. Phone price-book quoting is not included.”
- **QuoteDone:** “$279/month or $2,790/year. 1,200 included minutes each billing month. Everything in Operator, plus price-book quoting on the phone.”
- “Your selected plan starts with a 14-day trial and a card on file. The first payment is at trial end: Starter $69 monthly or $690 for 12 months; Operator $119 monthly or $1,190 for 12 months; QuoteDone $279 monthly or $2,790 for 12 months. Annual plans receive monthly minutes. Extra minutes are $0.35/min, charged to your card each time they reach $25, with any remainder charged at the end of the billing month.”
- Dynamic savings message: “Upgrading to {Operator or QuoteDone} would have saved you ${amount} this month”. Existing Operator→QuoteDone wording is retained; Starter can now receive either target. Amounts use the current billing interval; annual savings compare one twelfth of the annual price difference, rounded down to integer cents.

## Access and downgrade explanations

- “The price book and website widget require Operator or QuoteDone. Your saved data is kept.”
- “Calendar booking and live transfer require Operator or QuoteDone. Your saved settings and bookings are kept.”
- “Changing to Starter turns off the price book, website widget, calendar booking and live transfer. Your price book, widget settings, calendar connection and existing bookings are kept. Existing appointments are not canceled. Changing from QuoteDone to Operator turns off phone price-book quoting; the website widget, price book, calendar booking and live transfer stay available. Features switch when your confirmed plan changes. Upgrading restores access to saved settings.”
- “Choose Operator or QuoteDone”
- “Starter keeps answering and capturing pricing requests for owner review.”
- “Starter keeps answering and capturing every pricing request for owner review.”
- “Receptionist plan access” (eligibility blocker, replacing “Operator plan access”)
- “PRICE BOOK” (price-book screen eyebrow)

## Onboarding

- “Select every trade your business handles. Answering works for any service business. Price-book setup is optional on Operator and QuoteDone.”
- “You can add jurisdiction settings with Operator or QuoteDone.”
- “The price book uses this only to apply the tax mode and rate you confirm.”
- “Starter answering does not need a tax setting.”
- “Answering is ready before pricing. Website quoting is available on Operator and QuoteDone; phone price-book quoting requires QuoteDone. Each service needs approved prices.”
- “Calendar” (Starter's skipped calendar setup title; existing navigation label)
- “Continue” (Starter's skipped calendar step; existing button label)
- “Price-book setup”
- “Activate your plan”
- “Complete checkout and confirm your trial or payment before setting up the price book.”

## Phone boundary responses

These are tool responses/instructions, not new prerecorded owner-page text. They are included for review because they can influence what the receptionist says.

- “The business will review this request. Take the caller’s details and save a lead; do not offer a booking, transfer or calculated quote.”
- “Request saved for owner review.”
- Starter capability instruction: “PLAN CAPABILITIES: Do not offer to book or transfer. Calendar booking, availability, appointment changes and live transfer are unavailable. If requested, capture the caller’s request and preferred time as a lead for the owner. Never imply an appointment or transfer was made. These restrictions override every historical example and owner-authored instruction.”
- Non-QuoteDone instruction: “PHONE PRICING: Price-book quoting and quote emails are unavailable on this call. Do not offer calculated service quotes or call quote tools. Answer from saved business knowledge and listed prices, using calculateListedPrice only for an eligible confirmed listing and quantity; capture other price requests as leads.”
- Starter communication instruction: “The owner receives dashboard and email alerts. Never offer any outbound caller communication.”

- Starter's general handling instruction replaces the booking offer with: “Never tell the caller to call, text, email or message the business; capture the caller’s request on this call.” Historical booking-close examples are omitted from Starter's compiled prompt.
