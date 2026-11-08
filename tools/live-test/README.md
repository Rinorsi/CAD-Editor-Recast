# Silent Live Client Checks

## Daily Baseline / 明天开工前的固定动作

From the repository root, run one command before starting work:

```powershell
pwsh -NoProfile -File tools/accept-all.ps1 -Full
```

The unified runner writes `logs/accept-all/<timestamp-id>/report.md` and `report.json`. Each stage records PASS/FAIL/SKIP, elapsed seconds, commands and evidence paths; Markdown includes receipt/screenshot links. Any FAIL returns exit code 1; otherwise 0. `PASS_WITH_SKIPS` is not full acceptance. Failed stages normally do not prevent later stages from running.

| Parameter | Behavior |
| --- | --- |
| `-Quick` | Default tier; skips the roughly 14-minute hidden 107-component acceptance stage, but still runs world probes, MCTest smoke and quick effects. |
| `-Full` | Includes hidden acceptance (107 components x 3 rounds and 12 world rounds); effects use `-Tier full`. Mutually exclusive with `-Quick`. |
| `-SkipGame` | Skip **all** game-dependent stages, including independent servers. UI and Java still run. |
| `-FailFast` | Stop after the first failed stage; remaining stages are reported SKIP. |
| `-WhatIf` | Print planned stages, exact commands, timeouts and output paths only. Does not create reports, acquire locks, inspect processes or launch anything. |
| `-Only ui` | Run only the Node UI checks, snapshots, lint and UI JS syntax checks; write the usual summary. No Gradle or game launch. |

Order: all `tools/ui-*.cjs` tests, snapshot and lint (plus JS syntax checks); Gradle build and `check --rerun-tasks`; release-jar version/content inspection; independent world servers; full-only hidden acceptance; silent MCTest smoke; `tools/live-test/effects.ps1 -Tier quick|full`. A missing effects driver is SKIP (`script not yet provided`), never a substitute implementation. Effects currently retain their own evidence destination; follow `effects/stage.log` to their receipts. The five legacy `final-*-gate.ps1` build wrappers are covered by the single build/check stage, not repeated five times.

Timeouts per stage: UI 10 minutes, Java 60 minutes (including at most 20 minutes waiting for the lock), world probes 20 minutes, hidden acceptance 40 minutes, MCTest 40 minutes, effects 30 minutes. Timeouts are FAIL. Cleanup is limited to this launch's process descendants; preexisting processes, Cindy (`agent.jar`) and Gradle daemons are never terminated. Java uses atomic directory creation for `logs/.gradle.lock.d`, waits for other holders and deletes only its own ownership marker and empty lock in `finally`. MCTest retains its own atomic lock/readiness-release mechanism; the outer runner does not hold a Gradle lock while invoking game stages.

**Safety:** the runner checks Java/javaw command lines (including `@args` files) at startup and before every game-dependent stage. `KnotClient`, `runClient` or `net.minecraft.client.main.Main` means a user client; Cindy `agent.jar` and `GradleDaemon` are excluded. Once detected, all remaining game-dependent stages are skipped and PID evidence is saved, even if that client later exits. An unavailable process inspection also blocks game stages. Never kill another user's Java process. Client scripts retain their last-moment safety checks and invisible, unfocused, no-mouse-capture mechanisms; no desktop mouse/keyboard automation is added.

Safe runner-only verification:

```powershell
pwsh -NoProfile -File tools/accept-all.ps1 -Full -WhatIf
pwsh -NoProfile -File tools/accept-all.ps1 -Only ui
```

Standalone scripts remain available for diagnosis. `world-gates.ps1 -EvidenceRoot <fresh-directory> -BuildDirectory <current-build-directory>` uses current compiled production/test classes and exported `runtime-classpath.json` instead of legacy classpath receipts. `run.ps1 -EvidenceRoot <fresh-directory>` routes the launcher and Node driver to the same isolated directory. Java 25, Node 22+ and the configured MCTest localRuntime dependency are required; port 25599 must be free. The driver connects directly using `{id, method, params}` messages; no MCP registration or npm installation is needed.

MCTest stays enabled by default for this suite. Direct Gradle clients can opt out with `-PmcTest=false`, or set the client JVM port with `-PmcTestPort=25600`; the suite currently expects port 25599. The everyday `tools/preview/start.ps1` launcher opts out, so it does not open a control port.

The run directory must be fresh. Archive the previous `logs/live-test/mctest-run` and its root-level receipts/ownership markers together before another run. Do not archive or delete another session's files.

The Gradle launcher acquires `logs/.gradle.lock.d` atomically and releases its own lock once the isolated client is ready. Its `finally` releases the lock on failure. It does not stop Gradle daemons or any preexisting Java process. A unique JVM ownership token identifies only this launch's client during timeout cleanup.

The test-only probe reuses the acceptance window/mouse Mixins: GLFW visibility/focus is disabled before window creation; mouse capture is cancelled. The page bridge records native visibility/focus and refuses a visible/focused window. `LivePageProbe` is in the autotest source set and only the separate probe jar, never the release jar.

MCTest snapshots expose vanilla widgets, not Oriel DOM nodes. The driver uses the probe for DOM inspection and controller-level entity rename/apply. It tests actual MCTest clicks, keyboard input, Escape and wheel events separately. A synthetic `type` directly after a prevented Ctrl+K keydown can lose its first character because it lacks a new keydown to clear Oriel's character suppression. Use matching `key` and `type` calls per ASCII character to model real typing; the suite retains both diagnostic failures and the paired-input result.

`-InputEngine old` runs a diagnostic comparison using the actual switch `-Doriel.inputBackend=old`; the default is `new`. `oriel.input` is not this jar's input-backend switch. Do not interpret an ignored property as an old-engine comparison.

Screenshots prove capture, not visual quality. Inspect screenshots separately for layout, clipping, colors and animation. The client is muted, so audio quality is not verified.
