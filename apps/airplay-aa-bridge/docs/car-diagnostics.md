# Persistent car diagnostics

`airplay-aa-diagnostics.service` records car-facing evidence on the Pi even when
Wi-Fi is unavailable. It starts independently at boot, before the bridge, and
survives bridge restarts. It never opens USB endpoints, changes gadget state,
restarts the bridge or reboots the Pi. Its readiness wait is capped at three
seconds; the bridge does not require the recorder to succeed.
The bridge itself starts after `network.target` rather than waiting for
`network-online.target`. USB/AOA startup can therefore proceed when neither the
home network nor the phone hotspot is available. AirPlay still requires an
actual network connection to its sender.

Install/update just the recorder from a staged project tree:

```bash
sudo bash scripts/install-car-diagnostics.sh
```

The installer only copies the recorder and unit, reloads systemd, and enables and
restarts the diagnostics service. The complete Pi installer includes this step.
The existing legacy bench updater does not install the recorder; run the command
above separately when using that updater.

Evidence is stored in `/var/log/airplay-aa/diagnostics/car-events.jsonl` plus four
rotated files (`.1` newest through `.4` oldest). Each file is capped at 2 MiB,
for a maximum of 10 MiB. Files are mode `0600`, directory `0700`. Records are
flushed at transitions/errors and at least every five seconds when writing.
Sudden power loss can still lose recent evidence; these logs do not make
unplugging a running Pi safe.

The recorder captures:

- Boot ID, observed uptime/UTC, recorder identity, and AAServer attempt number.
- AAServer process PID/start ticks, USB state and negotiated/current speed.
- Kernel USB enumeration, reset/timeout, and undervoltage/normalization events,
  including their source monotonic timestamps when available.
- Ten-second voltage/throttle samples and a 30-second recorder heartbeat.
- Recognized AOA/version/auth/discovery/input/setup/focus/start observations.
- Media session IDs, negotiated credit limits, credit exhaustion, stop messages,
  and classified framing/channel/TLS/USB errors without raw exception text.

Protocol stages are parsed from actual AAServer log messages. A focus request is
distinct from a received focus indication. A startup timeout before version
negotiation is distinct from waiting for projection after video setup. A video
start message does not prove that the car displayed a frame. Numeric response
statuses and accepted flags remain visible, including rejection.

The stage timestamps describe when the recorder read a line, not exactly when
the USB message was sent. Uptime and boot ID remain usable if the wall clock
changes after Wi-Fi connects. Kernel records replayed at recorder startup retain
their original monotonic timestamps, are marked as replayed, and can be deduplicated using those times
and event fields. One-second state sampling may miss brief transitions; kernel
and FunctionFS records supply finer evidence when they are emitted.

Existing AAServer log contents are skipped when the recorder first attaches, so
historical success cannot pass as a new connection. Subsequent replacement or
truncation is followed from its start. The launcher rotates its previous log
before creating the next one, avoiding same-file truncate/regrow races.
An attempt number is assigned only after observing the launch timestamp line;
attaching partway through an existing attempt leaves its number unknown.

The recorder stores structured allowlisted fields, not raw media, discovery
identifiers, AirPlay URLs, credentials, or packet dumps. An unavailable sensor
or command is marked unavailable rather than reported as a healthy zero value.

After a car attempt, collect the bounded logs once the Pi is reachable:

```bash
ssh quirino@10.0.0.113 'sudo systemctl status airplay-aa-diagnostics.service --no-pager'
ssh quirino@10.0.0.113 'sudo cat /var/log/airplay-aa/diagnostics/car-events.jsonl'
```

Collect the rotated files too when an attempt predates the current file. Match
records by boot ID, recorder ID, attempt number and uptime, then identify the
first stage that failed before changing USB or protocol behavior.
