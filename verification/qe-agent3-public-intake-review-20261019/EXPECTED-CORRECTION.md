# Pre-public-execution fixture correction

This correction was recorded after the authenticated save/approval probe and before any public prepare/final quote execution.

The initial interior-paint control included installed optional ceilings and trim for 380,000 cents. On a newly saved service, confirming the required `painting_coats_20261017` starting values made activation require `trimCoats` and `trimSurfaceCondition`, while the configured-offering contract rejected those same customer inputs. The service remained `NEEDS PRICING` and was omitted from the public catalog. That setup-boundary reproduction is retained as a finding; it is not silently folded into the public matrix.

To complete the 20-service public intake matrix without forging a historical adoption receipt, the public control uses the same installed interior offering with optional ceilings and trim disabled:

`500 measured wall sq ft * 600 cents/sq ft = 300,000 cents`.

The public correction remains a hidden-field check: `ceilingsIncluded:false` plus stale `ceilingAreaSqft:200` must not produce a priced receipt.

The same activation probe showed that the confirmed new roof-rule receipt exposes `pitchMethod` plus `pitchBand` instead of the historical `pitch` enum. Before public execution, the low-pitch control was therefore expressed as `pitchMethod:whole_roof` and `pitchBand:up_to_six`; the 244,600-cent arithmetic is unchanged.
