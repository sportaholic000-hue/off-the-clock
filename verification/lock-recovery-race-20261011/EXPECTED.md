# Expectations written before execution — 2026-10-11

Base: a7effaf39ae382eadb0513979bf077ba236ea88f, confirmed with git ls-remote.
All owners, dead-holder records, children and files are synthetic.

1. Two-child stale recovery: pause recovering child B after its last ownership
   read, let child A attempt acquisition, then resume B while A is still alive.
   Expected: no overlapping callbacks; either contender receives OFFSITE_BUSY.
   On the unfixed base both callbacks are expected to enter together.
2. Ledger reproduction: the same stale recovery schedule, with replacement A
   paused immediately before publishing its older ledger. Recoverer B records B,
   then A publishes. Expected final owner set: SYNTHETIC-A and SYNTHETIC-B.
   On the base A is expected to overwrite B. After repair, a busy contender retries
   after the holder exits and both entries must remain.
3. Defense in depth without any retention lock: pause one ledger publication,
   record another owner, resume the first. Expected: both owners remain.
4. Migration: all old owners.json entries and new owner receipts survive retries
   and competing writers; malformed input fails closed. Existing owner timestamp
   stays immutable. Dead process/SIGKILL recovery, previous-instance PID 1, live
   exclusion, nested acquisition, exception release and immediate OFFSITE_BUSY
   remain required. SQLite lock database files must never be unlinked/replaced.
