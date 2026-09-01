#!/usr/bin/env python3
"""Analyze an iPhone Rover validation CSV without third-party dependencies."""

from __future__ import annotations

import argparse
import csv
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path


def number(row: dict[str, str], key: str) -> float | None:
    value = row.get(key, "").strip()
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def p95(values: list[float]) -> float | None:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    return statistics.quantiles(values, n=100, method="inclusive")[94]


def measured(label: str, value: float | None, unit: str = "") -> None:
    if value is None:
        print(f"{label}: unavailable")
    else:
        print(f"{label}: {value:.3f}{unit}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("log", type=Path)
    args = parser.parse_args()

    try:
        with args.log.open(newline="") as stream:
            rows = list(csv.DictReader(stream))
    except OSError as error:
        print(f"Unable to read {args.log}: {error}", file=sys.stderr)
        return 2

    if not rows:
        print("No validation rows found; no physical result can pass.")
        return 1

    rows.sort(key=lambda row: number(row, "timestamp_ms") or 0)
    telemetry = [row for row in rows if row.get("event") == "telemetry"]
    stop_rows = [row for row in rows if row.get("event") == "stop"]

    latencies = []
    for row in telemetry:
        sent = number(row, "command_sent_ms")
        received = number(row, "timestamp_ms")
        if sent is not None and received is not None and received >= sent:
            latencies.append(received - sent)
    latency_p95 = p95(latencies)
    measured("BLE p95 command-to-telemetry latency", latency_p95, " ms")
    print(f"BLE latency samples: {len(latencies)}")

    stop_delays = []
    stop_distances = []
    for stop in stop_rows:
        stop_time = number(stop, "timestamp_ms")
        run_id = stop.get("run_id")
        if stop_time is None:
            continue
        following = [
            row for row in rows
            if row.get("run_id") == run_id
            and (number(row, "timestamp_ms") or -1) >= stop_time
            and row.get("stopped", "").lower() in {"1", "true", "yes"}
        ]
        if not following:
            continue
        settled = following[0]
        settled_time = number(settled, "timestamp_ms")
        if settled_time is not None:
            stop_delays.append(settled_time - stop_time)
        start_x = number(stop, "encoder_x_m")
        start_z = number(stop, "encoder_z_m")
        end_x = number(settled, "encoder_x_m")
        end_z = number(settled, "encoder_z_m")
        if None not in (start_x, start_z, end_x, end_z):
            stop_distances.append(math.hypot(end_x - start_x, end_z - start_z))
    measured("p95 stop response", p95(stop_delays), " ms")
    measured(
        "maximum measured stopping displacement",
        max(stop_distances) if stop_distances else None,
        " m",
    )

    run_groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        run_groups[row.get("run_id", "default")].append(row)
    runtimes = []
    temperatures = []
    endpoint_errors = []
    for run_rows in run_groups.values():
        timestamps = [
            value for value in (number(row, "timestamp_ms") for row in run_rows)
            if value is not None
        ]
        if timestamps:
            runtimes.append((max(timestamps) - min(timestamps)) / 1000)
        temperatures.extend(
            value for value in (number(row, "temperature_c") for row in run_rows)
            if value is not None
        )

        last = run_rows[-1]
        ar_x = number(last, "ar_x_m")
        ar_z = number(last, "ar_z_m")
        encoder_x = number(last, "encoder_x_m")
        encoder_z = number(last, "encoder_z_m")
        if None not in (ar_x, ar_z, encoder_x, encoder_z):
            endpoint_errors.append(
                math.hypot(ar_x - encoder_x, ar_z - encoder_z)
            )

    measured("shortest run duration", min(runtimes) if runtimes else None, " s")
    measured("maximum temperature", max(temperatures) if temperatures else None, " °C")
    measured(
        "maximum ARKit/encoder endpoint error",
        max(endpoint_errors) if endpoint_errors else None,
        " m",
    )
    measured(
        "endpoint error spread",
        max(endpoint_errors) - min(endpoint_errors)
        if len(endpoint_errors) > 1 else None,
        " m",
    )
    print(f"Runs: {len(run_groups)}")
    print("Result: measurements are available; compare them with validation.md thresholds.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
