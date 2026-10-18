# Application observations expected before execution

These tests assert the predicted behavior of the unchanged application, not
that its false-live/false-block states are correct. The factor reproduction
continues to fail until a separately authorized repair.

Use the frozen positive-rate fixture, explicit CAD/UTC defaults and an
owner-set unknown-pitch band `up_to_six`. New draft creation strips all
server-owned receipts. Real save, approval, reload, readiness, preview,
intake and calculation run on the synthetic local SQLite/file store.

| Saved change | Predicted postapproval status | Selected calculation |
|---|---|---|
|none|QUOTING LIVE|READY, 391000c|
|story[1]=0.5|QUOTING LIVE|review despite current receipt|
|shape.simple=0.5|QUOTING LIVE|review despite current receipt|
|both selected factors 0.5|QUOTING LIVE|review despite current receipt|
|story[2]=0.5, request two stories|QUOTING LIVE|review|
|shape.moderate=0.5, request moderate|QUOTING LIVE|review|
|all story entries 0.5|NEEDS PRICING|review|
|all shape entries 0.5|NEEDS PRICING|review|
|shape.complex=0.5, request simple|NEEDS PRICING|direct engine READY391000c, application blocked|

Reason for the predictions: activation chooses the greatest story value and
the highest-waste shape, not every combination. A bad non-probed factor can
be hidden; a failed probed shape can suppress an otherwise valid selection.

Receipt experiment: approve the control, change story[1] through the real
save API, retain the prior receipt, and observe `approvalCurrent:false`
with `contentDigest` diagnostic. Explicit reapproval should make that
receipt current again without curing the calculation. A cloned receipt
with a deliberately different engineVersion must remain noncurrent.
This is a version-mismatch simulation, not a genuine historical-v7 receipt.

Before the final corrected harness execution: direct-engine comparisons use
the real bridge's normalized request, explicitly setting active only in that
comparison so a failed service-wide status does not mask an independently
priced selection. Raw saved rows contain application-only metadata that the
engine correctly rejects; they are not direct engine requests. Owner preview
explicitly permits inactive services. Consequently the complex-shape-half /
simple-request case is expected to preview READY391000c while its actual
customer application remains blocked. This corrects the evidence harness's
assumption that every preview must match the customer eligibility gate.

Two further standalone rounding assertions demand the previously written
27c and25c values. They should expose the native subtraction under-rounding
as failures. A grouping counterexample remains a passing9c control;
blindly rounding its combined installation once would give8c.
