# Named review contact in agent knowledge — October 6, 2026

## Owner-approved requirement

The owner confirmed that the receptionist should know the owner's or manager's
name as part of its business knowledge and use that person naturally when a
question or request requires review. The receptionist must not invent answers.

Each business must have an owner-confirmed review contact name and role
(owner or manager). The existing signup owner first name can prefill this
information for confirmation; the owner may designate a manager instead.
The contact must be associated with the actual review recipient, not merely
a name inserted into a script.

The review contact, business name and receptionist's own name are distinct.
Do not substitute the business name where the conversation refers to a person.
Use only the configured name and role; do not invent a manager or call a
designated manager the owner.

## Caller behavior

Use normal receptionist language. For example, when the review workflow is
available: "Let me check with [configured name] on that. What's the best number
for a callback?" The placeholders here describe substitution, not spoken text.

Do not use "Your request is saved for the business to review" as the standard
caller-facing handoff. Truthful communication does not require database or
workflow language.

If a business answer is absent or uncertain, collect the question and available
callback details, preserve the relevant context and flag it for the configured
review contact. Do not guess a price, policy, availability or response time.
Missing identity must not be filled with a fabricated person or title.

A saved or flagged question does not prove its notification was sent or read.
Say "I've sent [configured name] your message" only after sending is confirmed;
do not imply that the person read it, accepted the task or promised a deadline.
Failures require truthful, natural wording based on what actually succeeded.

## Scope and implementation status

This requirement supplies no callback or quote deadline. It does not resolve
the separate P01 conflict over historical/default response deadlines; that
broader timing decision remains pending.

The existing platform section 4 already collects the owner's first name.
At the inspected source, voicePromptCompiler.js instead defines "[owner]" as
businessName and accepts only businessName/agentName in its business facts.
The named contact therefore still needs implementation and verification.

This checkpoint changes only this decision and platform section 6.5. It does
not implement the knowledge editor, prompt/runtime wiring or owner-alert
pipeline, change the immutable voice guide, expand either active repair-agent
batch, or assert notification delivery works. Historical audits remain unchanged.

Implementation must verify saved contact selection, correct identity in compiled
instructions, unknown-answer capture, owner/tenant routing and truthful
notification wording using synthetic data. No live calls/messages are authorized.

No application tests are claimed for this documentation-only decision.
Publication is verified by exact file readback and a two-file commit comparison.
