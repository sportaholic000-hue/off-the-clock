# Publication transport evidence

Initial local checkpoint commit: `059138a5` (full identity remains in local Git).
The following actual push, from `/workspace/scratch/998ee29c5e28/restore-isolation-control`, exited 128:

```sh
git push origin HEAD:refs/heads/codex/restore-isolation-20261014
```

Complete push output:

```text
fatal: could not read Username for 'https://github.com': No such device or address
```

The enclosing tool call reported exit 128 and about 10 seconds wall time. No separate push start/end timestamps or signal field were recorded. A successful local commit preceded the failed push. No remote checkpoint was claimed from this command. Publication continues through the already connected GitHub API, without changing the allowed scope.

After hosted verification, a report-authoring apply_patch request attempted a delete and add for the same REPORT.md in one patch. It was rejected before any write:

```text
apply_patch verification failed: invalid patch: multiple operations target /workspace/scratch/998ee29c5e28/restore-isolation-control/verification/restore-isolation-20261014/REPORT.md
```

The report was then written with one update operation. This authoring error did not affect the hosted execution, application, raw outputs or evidence ZIP. No application command was rerun.
