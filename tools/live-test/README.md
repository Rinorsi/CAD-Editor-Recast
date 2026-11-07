# Silent Live Client Checks

All evidence is written to `logs/live-test/`. Do not run alongside a user's Minecraft client.

1. Run `pwsh -NoProfile -File tools/accept/run.ps1 -EvidenceRoot logs/live-test` for the full component/world acceptance suite.
2. Run the five existing `tools/world-edit/final-*-gate.ps1` scripts sequentially. They build/check; they do not launch the ticking servers. Their legacy build logs remain under `logs/world-*`.
3. After a successful current build, run `pwsh -NoProfile -File tools/live-test/world-gates.ps1` to reuse the five server probes with current compiled production/test classes and isolated evidence paths. Start with a fresh `logs/live-test/world/classes` directory.
4. Run `pwsh -NoProfile -File tools/live-test/run.ps1` for MCTest. Java 25, Node 22+ and the configured MCTest localRuntime dependency are required. Port 25599 must be free. The driver connects directly using `{id, method, params}` messages; no MCP registration or npm installation is needed.

The run directory must be fresh. Archive the previous `logs/live-test/mctest-run` and its root-level receipts/ownership markers together before another run. Do not archive or delete another session's files.

The Gradle launcher acquires `logs/.gradle.lock.d` atomically and releases its own lock once the isolated client is ready. Its `finally` releases the lock on failure. It does not stop Gradle daemons or any preexisting Java process. A unique JVM ownership token identifies only this launch's client during timeout cleanup.

The test-only probe reuses the acceptance window/mouse Mixins: GLFW visibility/focus is disabled before window creation; mouse capture is cancelled. The page bridge records native visibility/focus and refuses a visible/focused window. `LivePageProbe` is in the autotest source set and only the separate probe jar, never the release jar.

MCTest snapshots expose vanilla widgets, not Oriel DOM nodes. The driver uses the probe for DOM inspection and controller-level entity rename/apply. It tests actual MCTest clicks, keyboard input, Escape and wheel events separately. A synthetic `type` directly after a prevented Ctrl+K keydown can lose its first character because it lacks a new keydown to clear Oriel's character suppression. Use matching `key` and `type` calls per ASCII character to model real typing; the suite retains both diagnostic failures and the paired-input result.

`-InputEngine old` runs a diagnostic comparison using the actual switch `-Doriel.inputBackend=old`; the default is `new`. `oriel.input` is not this jar's input-backend switch. Do not interpret an ignored property as an old-engine comparison.

Screenshots prove capture, not visual quality. Inspect screenshots separately for layout, clipping, colors and animation. The client is muted, so audio quality is not verified.
