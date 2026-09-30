# Reopened account/session checkpoint

Base: `8a778d5346f10d69e586d0ae46006238e4fd169c`. Independent audit confirmed delayed refresh and logout cookie response races. Fix not implemented or verified yet. An isolated candidate preserves the base application bytes and is reproducing the final independent test. See PLAN.md; previous session pass counts do not cover this finding.
