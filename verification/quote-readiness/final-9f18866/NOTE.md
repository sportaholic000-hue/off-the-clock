# Previous complete verification run

Source `9f18866713345f8dc5f860d101430088b339266b` passed the automated checks recorded here. Subsequent visual review of its screenshots found the service sidebar could say `prices needed` for a live service, because its fallback counted root-level fields instead of nested pricing. This display defect and the screenshot timing were corrected in `25fca4812bbc0eb905b1d91124c2aa53aced791a`. Keep these original screenshots as reproduction evidence. The top-level report identifies the final accepted verification run.
