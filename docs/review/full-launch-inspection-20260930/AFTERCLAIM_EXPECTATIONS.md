# Additional interruption boundary, expected before execution

Source: PR #3 commit 6c670a48c881f8fa628cd70800b290371b730362.

The preceding preparation marker repair must not be treated as full process interruption recovery until the durable PENDING_PROVIDER marker-to-provider-request interval is checked too. The synthetic preload pauses at the Google event POST boundary before forwarding to the fixture. At this barrier the database must contain durable intent and a pending receipt, and the fixture must record zero provider writes for that attempt. Kill and restart the isolated application. Exact retry plus polling must confirm safely or reach a truthful recoverable terminal outcome that releases the slot; it must not remain permanently pending with no event. All other independent arithmetic, privacy, confirmation and duplicate-appointment controls remain unchanged. This is not a live Google test.
