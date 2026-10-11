"""Disposable actual-GStreamer clock probe; deliberately excludes NULL teardown.

All streaming errors are fatal. Once EOS and verified render counts are observed,
exit without Gst NULL: gstshmsink's upstream poll thread can post EBUSY during
intentional stop. The parent reaps this process and removes only its SHM names.
"""
import json
import os
import sys
import time


def finish(record, status):
    print("AIRPLAY_AA_PACING=" + json.dumps(record), flush=True)
    sys.stderr.flush()
    # Python/GObject finalizers must not invoke the excluded NULL teardown.
    os._exit(status)


def main():
    try:
        import gi
        gi.require_version("Gst", "1.0")
        from gi.repository import Gst

        Gst.init(None)
        expected_frames = int(sys.argv[2])
        pipeline = Gst.parse_launch(sys.argv[1])
        sink = pipeline.get_by_name("pacing_sink")
        if sink is None or sink.get_factory().get_name() != "shmsink":
            raise RuntimeError("Measurement requires the actual named shmsink")
        source = pipeline.get_by_name("pacing_source")
        if source is None or source.get_factory().get_name() != "videotestsrc":
            raise RuntimeError("Measurement requires the actual named video source")
        counts = {"source": 0, "sink": 0}

        def count_buffer(_pad, _info, key):
            counts[key] += 1
            return Gst.PadProbeReturn.OK

        source.get_static_pad("src").add_probe(Gst.PadProbeType.BUFFER, count_buffer, "source")
        sink.get_static_pad("sink").add_probe(Gst.PadProbeType.BUFFER, count_buffer, "sink")
        bus = pipeline.get_bus()
        started = time.monotonic()
        if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            raise RuntimeError("GStreamer failed to enter PLAYING")
        deadline = started + 8
        while time.monotonic() < deadline:
            message = bus.timed_pop_filtered(
                100 * Gst.MSECOND, Gst.MessageType.ERROR | Gst.MessageType.EOS,
            )
            if message is None:
                continue
            if message.type == Gst.MessageType.ERROR:
                error, debug = message.parse_error()
                raise RuntimeError(f"GStreamer ERROR: {error}; {debug}")
            elapsed = time.monotonic() - started
            stats = sink.get_property("stats")
            rendered = stats.get_value("rendered")
            dropped = stats.get_value("dropped")
            if counts["source"] != expected_frames:
                raise RuntimeError(f"Source emitted {counts['source']} of {expected_frames} frames")
            # videorate can repeat the final frame to close an EOS segment (1.28
            # does so for this source). Count actual arrivals independently;
            # never subtract an assumed extra frame from BaseSink statistics.
            if counts["sink"] < expected_frames or rendered != counts["sink"] or dropped != 0:
                raise RuntimeError(f"EOS sink received {counts['sink']}, rendered {rendered}; dropped {dropped}")
            # Do not let an already-posted error at the endpoint become PASS.
            pending = bus.pop_filtered(Gst.MessageType.ERROR)
            if pending is not None:
                error, debug = pending.parse_error()
                raise RuntimeError(f"GStreamer ERROR at EOS: {error}; {debug}")
            finish({"complete": "EOS", "rendered": rendered, "dropped": dropped,
                    "source_frames": counts["source"], "sink_frames": counts["sink"],
                    "elapsed_seconds": elapsed, "gstreamer": Gst.version_string(),
                    "scope": "clocked rendering through EOS; excludes NULL teardown"}, 0)
        raise RuntimeError("GStreamer timed out before EOS")
    except Exception as error:
        # Keep any live Gst objects until os._exit, including failure paths.
        finish({"error": str(error)}, 1)


if __name__ == "__main__":
    main()
