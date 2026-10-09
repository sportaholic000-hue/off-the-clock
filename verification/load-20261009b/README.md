# Five-round post-call memory measurement

One Node process, one production voice runtime, one HTTP/WebSocket server and one
SQLite connection, retained through all five rounds. Each round has 50 signed
synthetic calls with two minutes of 20 ms bidirectional silence frames, then a
two-minute cooldown. The Node process starts with `--expose-gc`; each cooldown
ends with exactly two explicit `global.gc()` calls and before/after measurements.

The prior driver is from `bc6309701da3b7b68c866cc65a30ddb9f834e289`:
`verification/load-20261009/voice-load.mjs`. Its fixture retains every client
socket and model callback in arrays until teardown. This measurement driver uses
active sets/maps and drops completed fake-client and per-round references. It
also closes the synthetic caller WebSocket after stop; the original driver left
that transport open. Raw measurements include the session counts after stop and
before peer closure to make this distinction visible. It
still runs the real signed production HTTP/WebSocket/voice/persistence path.
No application source changes were made for measurement. No external provider
client is called; fake Twilio mutation methods throw if invoked, and Google is
an injected fake Live client. No audio files are stored.

Exposed counts: production `boundary.activeSessionCount`, the actual injected
WebSocketServer's clients set, synthetic client sockets, and fake Google sessions.
Internal maps not exposed by the production API are not inferred to be empty.
`boundary.whenIdle()` is awaited after closure. Completed SQLite rows are retained.

## Environment limitation

This sandbox lacks `/proc`, so `process.memoryUsage()` fails with
`ENOENT: uv_resident_set_memory`. The script records RSS as null and explicitly
labels the fallback: `v8.getHeapStatistics().used_heap_size` and
`external_memory`. Peak RSS is not substituted for current RSS. On a host where
`process.memoryUsage()` succeeds, the same script records all requested fields.

## Reproduction

```sh
node --expose-gc verification/load-20261009b/voice-load.mjs \
  verification/load-20261009b/raw.json /path/to/synthetic-heap-snapshots
```

The first-round heap snapshot is captured after measurement because it cannot be
recreated after observing round five. If round-five post-GC heap exceeds round
one, the fifth-round snapshot is also captured. Analyze snapshots in a separate
process after the five rounds:

```sh
node verification/load-20261009b/heap-growth.mjs \
  /path/to/synthetic-heap-snapshots/round-1.heapsnapshot \
  /path/to/synthetic-heap-snapshots/round-5.heapsnapshot \
  verification/load-20261009b/heap-growth.json
```

Raw bytes and per-round timing/frame/status/count evidence are in `raw.json`.
Heap snapshot object counts describe growth, not proof of an application leak;
V8 caches, retained SQLite data, and the small measurement record also exist.

## Observed result

Run completed on Node v22.23.3 in one process: 250 completed calls, zero failure codes, zero unexpected provider writes. All four exposed counts were zero before and after every cooldown GC.

MiB (1,048,576 bytes), before GC → after GC:

| Round | RSS | heapUsed | external | Live counts after GC |
| --- | --- | --- | --- | --- |
| 1 | unavailable | 22.848 → 22.681 | 3.773 → 3.773 | 0 / 0 / 0 / 0 |
| 2 | unavailable | 22.395 → 22.395 | 3.767 → 3.767 | 0 / 0 / 0 / 0 |
| 3 | unavailable | 42.153 → 22.441 | 4.742 → 3.767 | 0 / 0 / 0 / 0 |
| 4 | unavailable | 42.639 → 22.518 | 4.742 → 3.767 | 0 / 0 / 0 / 0 |
| 5 | unavailable | 34.432 → 22.547 | 4.056 → 3.767 | 0 / 0 / 0 / 0 |

Post-GC heap levels off around 22.5 MiB across these five rounds. Round five is 140,224 bytes (0.134 MiB) below round one. There is a smaller 159,696-byte (0.152 MiB) upward drift from round two to round five; the whole five-round range is 0.286 MiB. The driver retains the small measurement records, and the database retains completed calls. External memory is identical in rounds two through five.

Conclusion: no accumulating JavaScript session leak was demonstrated in this five-round run. This does not establish the absence of a native/RSS leak: current RSS could not be measured. The original 13.21 MiB RSS result also included open synthetic transports and retained fixture history, so it is not directly comparable to closed-call memory here.

Round one was snapshotted as a precaution. Round five post-GC heap was lower than round one, so the script did not trigger its rising-heap snapshot comparison; no top-five growth ranking is claimed. Internal maps not exposed by the runtime remain outside the live-count measurements.
