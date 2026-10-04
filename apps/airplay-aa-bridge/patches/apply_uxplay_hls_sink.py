#!/usr/bin/env python3
"""Apply AirPlay-AA sink support to UxPlay renderers/video_renderer.c.

HLS playbin reads AIRPLAY_AA_HLS_SINK (a full bin). Mirror/jpeg read
AIRPLAY_AA_VIDEO_SINK_BIN and splice it into the gst_parse_launch string.
Both must be the same fixed-caps chain: shmsrc does not carry caps.
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER_OLD = (
    "            renderer_type[i]->codec = hls;\n"
    "            /* if we are not using an autovideosink, build a videosink based on the string \"videosink\" */\n"
    "            if (!auto_videosink) {"
)

MARKER_NEW = """            renderer_type[i]->codec = hls;
            /* AirPlay-AA: optional encode sink for HLS (YouTube) → H.264 FIFO.
             * UxPlay's -vs only accepts a single element name; mirror uses -vrtp.
             * HLS uses playbin's video-sink, so allow a full bin via env. */
            bool hls_sink_from_env = false;
            const char *hls_sink_bin = getenv("AIRPLAY_AA_HLS_SINK");
            if (hls_sink_bin && strlen(hls_sink_bin) > 0) {
                GError *sink_err = NULL;
                GstElement *hls_bin = gst_parse_bin_from_description(hls_sink_bin, TRUE, &sink_err);
                if (!hls_bin) {
                    logger_log(logger, LOGGER_ERR,
                               "AIRPLAY_AA_HLS_SINK parse failed: %s",
                               sink_err ? sink_err->message : "unknown");
                    if (sink_err) g_error_free(sink_err);
                } else {
                    logger_log(logger, LOGGER_INFO, "HLS video-sink from AIRPLAY_AA_HLS_SINK");
                    g_object_set(G_OBJECT(renderer_type[i]->pipeline), "video-sink", hls_bin, NULL);
                    hls_sink_from_env = true;
                    auto_videosink = false;
                }
            }
            /* if we are not using an autovideosink, build a videosink based on the string "videosink" */
            if (!auto_videosink && !hls_sink_from_env) {"""

# Mirror/jpeg append the -vs element name. Replace that with a bin so the
# frames written to shm match the HLS bin (I420, fixed size and rate).
MIRROR_OLD = """                g_string_append(launch, videosink);
                g_string_append(launch, " name=");
                g_string_append(launch, videosink);
                g_string_append(launch, "_");
                g_string_append(launch, renderer_type[i]->codec);
                g_string_append(launch, videosink_options);
                if (video_sync && !jpeg_pipeline) {
                    g_string_append(launch, " sync=true");
                    sync = true;
                } else {
                    g_string_append(launch, " sync=false");
                    sync = false;
                }
"""

MIRROR_NEW = """                const char *aa_video_sink_bin = getenv("AIRPLAY_AA_VIDEO_SINK_BIN");
                if (aa_video_sink_bin && aa_video_sink_bin[0] != '\\0') {
                    /* Same bin as AIRPLAY_AA_HLS_SINK. shmsrc has no caps of its own. */
                    logger_log(logger, LOGGER_INFO, "video sink from AIRPLAY_AA_VIDEO_SINK_BIN");
                    g_string_append(launch, aa_video_sink_bin);
                    sync = false;
                } else {
                    g_string_append(launch, videosink);
                    g_string_append(launch, " name=");
                    g_string_append(launch, videosink);
                    g_string_append(launch, "_");
                    g_string_append(launch, renderer_type[i]->codec);
                    g_string_append(launch, videosink_options);
                    if (video_sync && !jpeg_pipeline) {
                        g_string_append(launch, " sync=true");
                        sync = true;
                    } else {
                        g_string_append(launch, " sync=false");
                        sync = false;
                    }
                }
"""


def main() -> int:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} path/to/UxPlay/renderers/video_renderer.c", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    text = path.read_text()
    changed = False
    if "AIRPLAY_AA_HLS_SINK" not in text:
        if MARKER_OLD not in text:
            print("HLS marker not found — UxPlay source layout changed?", file=sys.stderr)
            return 1
        text = text.replace(MARKER_OLD, MARKER_NEW, 1)
        changed = True
    if "AIRPLAY_AA_VIDEO_SINK_BIN" not in text:
        if MIRROR_OLD not in text:
            print("mirror sink marker not found — UxPlay source layout changed?", file=sys.stderr)
            return 1
        text = text.replace(MIRROR_OLD, MIRROR_NEW, 1)
        changed = True
    if not changed:
        print(f"already patched: {path}")
        return 0
    if "#include <stdlib.h>" not in text:
        text = text.replace("#include <string.h>", "#include <string.h>\n#include <stdlib.h>", 1)
    path.write_text(text)
    print(f"patched: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
