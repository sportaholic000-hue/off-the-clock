# Owner-defined fencing and painting offerings

This work is in progress. Engine calculations alone are not application or launch acceptance.

The owner explicitly selected both complete installed prices and itemized pricing, per owner offering: an installed fence rate may include defined standard posts and footings; gates and removal may have separate prices. Painting offerings must explicitly state coats, preparation and primer inclusions. This ruling authorizes the scoped engine additions described here. It does not change unrelated arithmetic, the original voice guide, voice implementation, live providers or production data.

Each saved service is one offering. Existing service IDs and approval rules support multiple offerings of the same trade. New `offeringMode`, `offeringDetails` and `offeringRates` fields opt into the new behavior. Existing rates retain their units and meaning; no rate is supplied automatically. Exact saved scope and prices require the existing owner approval. Inactive choices may retain their prices but do not contribute to the selected job.

Fencing:
- The owner defines fence type, height, terrain, standard posts/footings/digging, and offered gates with opening width and included work.
- Complete installed prices charge measured fence length excluding gate openings. Standard posts and footings are included. Each installed gate package includes its own posts and footings.
- Itemized pricing charges measured infill length plus an explicitly supplied planned post count. Gate posts already included in a gate package are excluded from that separate count. The engine does not infer post quantities from total length or invent a layout.
- Replacement removal uses its separately measured length. The owner states whether the removal price includes disposal; the common disposal charge is replaced once when included.

Painting:
- The owner defines substrate, coating system, surface condition, wall height/building stories, finish coats, preparation and primer coats (including an explicit zero).
- Complete installed prices include the defined work per measured paintable wall/ceiling area. Trim may have its own complete installed price and scope.
- Itemized finish/primer use measured painted area multiplied by the defined coat counts. Preparation uses its separately measured affected area. Measured-area paint material prices are selling prices; this does not claim package-purchase takeoff from paint coverage/can sizes.
- Conditions that do not match the selected offering require a matching offering or review. Normal supported requests must produce prices. Existing supported measured interior painting remains available.

Unknown, contradictory or unsupported selected-job facts cannot silently disappear. Additional separate work retains the previously approved on-site estimate behavior. No new markup cap or guessed price has been introduced.

UI labels in this draft are proposed for owner review: “Offering pricing”, “Complete installed prices”, “Itemized measured components”, “What this offering covers”, “Measured fence length excluding gate openings”, “Confirmed planned posts not included in selected gate prices”, and “Measured area requiring the defined preparation, including selected ceilings”. The draft PR is not a deployment.

Independent positive totals before execution: installed/itemized fence installation $4500/$3920; replacement $4900/$4320; interior painting $3800/$2524; exterior painting $3000/$1794. These use explicitly synthetic test prices and are never customer defaults. Original failures, test setup errors, complete responses and stored records are retained. Final verification and exact source binding will be reported separately.
