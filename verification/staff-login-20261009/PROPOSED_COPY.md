# Proposed, pending owner approval

All wording below is new in this branch. Existing reused labels such as “New password”, “Confirm new password”, and the brand name are unchanged.

## Owner Team screen

- “Team”; “Invite office staff to help with calls, leads, quotes, calendar and customers.”
- “Loading team”; “Plan: [plan]. [number] staff seat/seats.”; “Unlimited staff seats.”
- Status words: “pending”, “active”, “suspended”. Reason: “This plan does not include this staff seat.”
- “Invite office staff”; “They will receive a one-time email link to choose their own password.”; “Name”; “Email”; “Send invitation”; “Sending…”
- “Resend invitation”; “Cancel invitation”; “Remove login”.
- “Invitation sent.”; “Invitation resent.”; “Invitation canceled.”; “Staff login removed.”
- “Starter includes the owner login only. Move to Operator or QuoteDone to add office staff.”; “This plan includes no staff seats.” (unknown future plan).

## Customer and quote screens

- “Customers”; “Customer details saved for your business.”; “Loading customers”; “No saved customers yet.”; “Customer”; “No phone saved”.
- “Send saved quote”; “Recipient: [email]. The saved quote is sent by email.”; “I confirmed this email address with the customer.”; “Send quote by email”; “Queuing…”; “Quote email status: [status]. Check delivery before promising arrival.”

## Invite password screen and API messages

- “Set up your staff login”; “Your staff login is ready. Sign in with your new password.”; “This link is invalid or has expired. Ask the owner to resend the invitation.”; “Set password”.
- “Business not found.”; “Enter a name and valid email address.”; “Starter includes no staff logins.”; “Your plan has no available staff seats.”; “This email already belongs to an account.”; “The invitation email could not be sent. Resend the invitation.”; “Pending invitation not found.”; “This invitation is already active.”; “Staff login not found.”; “This link is invalid or the password is too short.”; “This link is invalid or has expired.”

## Email wording

- Invite subject: “Your office-staff invitation”.
- Invite body: “[business name] invited you to set up your office-staff login: [fragment-only link]\n\nThis one-time link expires at [timestamp]. If you did not expect this invitation, you can ignore it.”
- Saved quote email reuses the existing subject “Your quote from [business name]” and the existing “View your saved quote: [link]” footer. For a saved quote without a voice narration, the new fallback body consists of the saved service name, each saved option name and amount/range with price basis, saved tax treatment, saved disclaimer, then “This is a preliminary estimate. The business will confirm the job details on site.” No arithmetic or owner rates are introduced.
