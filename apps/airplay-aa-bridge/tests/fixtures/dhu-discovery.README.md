`dhu-discovery.hex` is a minimal wire reconstruction of the DHU 2.1-mac
service-discovery video and audio descriptors observed in the Raspberry Pi's
`/var/log/airplay-aa/aaserver.log` on 2026-10-10 at about 10:32. It is not a
captured binary packet. Sensor/input/vendor descriptors and HU metadata are
omitted; the video/audio field values and omitted video `media_type` reproduce
the actual parse failure.

Video channel 2 advertises H480, F60, zero margins, DPI 160, additional depth
0, viewing distance 500, aspect ratio 10000, actual density 160, codec 3,
display ID 0 and display type 0. The descriptor has no media field 1. Audio
channel 4 advertises PCM speech at 16000/48000 Hz, 16-bit mono; channel 5
advertises PCM media at 48000 Hz, 16-bit stereo.

The fixture bytes were encoded directly from those numeric wire fields,
independently of the patched parser and discovery helper. The old required
field constraint and corrected production schemas parse the same bytes.

Current primary schemas make the media type optional and identify codec 3
as H.264 baseline: [AVChannel](https://github.com/mrmees/open-android-auto/blob/main/oaa/av/AVChannelData.proto),
[codec values](https://github.com/mrmees/open-android-auto/blob/main/oaa/av/MediaCodecTypeEnum.proto),
and [VideoConfig](https://github.com/mrmees/open-android-auto/blob/main/oaa/video/VideoConfigData.proto).
