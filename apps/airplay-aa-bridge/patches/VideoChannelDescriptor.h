// Distributed under GPLv3 only as specified in AACS repository LICENSE.
#pragma once

#include "MediaChannel.pb.h"
#include <google/protobuf/unknown_field_set.h>

namespace airplay_aa {

// Current DHU omits media_type on its video descriptor. Identify it from
// advertised video capabilities, retaining explicit H.264 support for old HUs.
inline bool isH264VideoChannel(const tag::aas::MediaChannel &media) {
  const auto &unknown = media.GetReflection()->GetUnknownFields(media);
  for (int index = 0; index < unknown.field_count(); ++index) {
    if (unknown.field(index).number() == 1) {
      return false; // An unrecognized explicit codec is not an omitted type.
    }
  }
  if (media.has_media_type() && media.media_type() != tag::aas::MediaStreamType::None &&
      media.media_type() != tag::aas::MediaStreamType::Video) {
    return false;
  }
  if (media.audio_configs_size() != 0 || media.video_configs_size() == 0) {
    return false;
  }
  // StartIndication currently selects index 0; don't discover a later codec
  // that the sender would never select.
  const auto &config = media.video_configs(0);
  return config.IsInitialized() &&
         config.video_resolution() != tag::aas::VideoResolution::None &&
         config.video_fps() != tag::aas::VideoFps::None &&
         (!config.has_codec() || config.codec() == tag::aas::MediaStreamType::Video);
}

} // namespace airplay_aa
