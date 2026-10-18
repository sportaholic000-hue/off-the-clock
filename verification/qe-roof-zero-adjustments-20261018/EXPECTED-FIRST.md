# Independent expectations, written before execution

All rates and jobs here are synthetic test inputs, not proposed owner defaults.
Base commit: 1857b7779b83b70f7753b41b72c3677270cd4ffc.
Reviewed reproduction: befc00358dfc82a864eaffeb229db7c386045051.

1000 measured sqft = 10 squares. Labor 10*20000=200000 cents;
field material 10*1.10*10000=110000; first tear-off 10*6000=60000;
underlayment 10*100=1000; disposal 10*2000=20000. Base=391000.
Upper-band installation adds62000 and removal adds32800, hence485800.
Zero installation=423800; zero removal=453000; both zero=391000.
Three layers with additional-layer factor0 retain60000 disposal:431000.
At two stories, labor adds20000 and first tear-off adds6000; additional
tear-off and its story adjustment stay0. Total457000. At three stories483000.

Whole-roof band table (base391000; 500sqft partial is exactly half):
| Band | Both positive | Zero installation | Zero removal | Both zero |
|---|---:|---:|---:|---:|
|7–9|451800|411800|431000|391000|
|10–12|485800|423800|453000|391000|
|over12 (explicit .50/.60)|539000|439000|491000|391000|
Up-to-six has no pitch addition;391000 independently of inactive zero adders.

Mixed measured areas:100sqft up-to6,200 at7–9,300 at10–12,400 over12.
Installation:8000+18600+40000=66600; removal:4160+9840+19200=33200.
Total490800. Setting either/both factors to0 subtracts only the corresponding
term. Full scope, explicit1000sqft partial of2000, and50% partial of2000
must all agree. All installation0=424200; all removal0=457600; both0=391000.

Layers2/3/4 with factor0:411000/431000/451000 at one story; add26000 at
two stories or52000 at three. Disposal remains40000/60000/80000. Partial
500sqft halves each term. Combined zero pitch/layers at two stories457000.
Positive factor.70, three layers/two stories:457000+84000+8400=549400.

Rounding edge:100.05sqft=1.0005sq. With upper installation0, components
are20010 labor +11006 material (11005.5 half-up) +6003 tear-off +100
underlay +2001 disposal +3282 steep removal (3281.64 rounded)=42502.

Missing/null/blank/string/negative/nonfinite factors must not quote as numeric
zero. Missing over12 configuration still requires owner setup. Unconfirmed
products/settings and old-version approval must not authorize new quotes.
Current explicit owner approval must preserve rates and zero settings. A genuine
v8 positive receipt stays byte-identical on replay before and after v9 approval.
No below-one story/shape policy change is authorized by these expectations.
