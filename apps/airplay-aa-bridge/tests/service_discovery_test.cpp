// Regression against DHU's observed omitted media_type and advertised H.264.
#include "DiscoveryFixture.pb.h"
#include "VideoChannelDescriptor.h"
#include <cassert>
#include <fstream>
#include <iostream>
#include <iterator>
#include <sstream>
#include <string>

static std::string readHex(const char *path) {
  std::ifstream stream(path);
  assert(stream);
  std::string word, wire;
  while (stream >> word) {
    assert(word.size() == 2);
    wire.push_back(static_cast<char>(std::stoul(word, nullptr, 16)));
  }
  return wire;
}

int main(int argc, char **argv) {
  assert(argc == 2);
  const auto wire = readHex(argv[1]);
  fixture::LegacyServiceDiscoveryResponse legacy;
  assert(legacy.ParsePartialFromString(wire));
  assert(!legacy.IsInitialized());
  assert(legacy.InitializationErrorString().find("media_type") != std::string::npos);

  fixture::ServiceDiscoveryResponse discovery;
  assert(discovery.ParseFromString(wire));
  assert(discovery.channels_size() == 3);
  const auto &observed = discovery.channels(0).media_channel();
  assert(discovery.channels(0).channel_id() == 2);
  assert(!observed.has_media_type());
  assert(observed.video_configs_size() == 1);
  assert(observed.video_configs(0).video_resolution() == tag::aas::VideoResolution::H480);
  assert(observed.video_configs(0).video_fps() == tag::aas::VideoFps::F60);
  assert(observed.video_configs(0).codec() == 3);
  assert(airplay_aa::isH264VideoChannel(observed));
  assert(!airplay_aa::isH264VideoChannel(discovery.channels(1).media_channel()));
  assert(!airplay_aa::isH264VideoChannel(discovery.channels(2).media_channel()));

  auto candidate = observed;
  candidate.set_media_type(tag::aas::MediaStreamType::Video);
  assert(airplay_aa::isH264VideoChannel(candidate));
  candidate.set_media_type(tag::aas::MediaStreamType::AudioAac);
  assert(!airplay_aa::isH264VideoChannel(candidate)); // Value 2 means AAC, not video.
  candidate = observed;
  candidate.mutable_video_configs(0)->set_codec(7); // H.265 cannot take H.264 packets.
  assert(!airplay_aa::isH264VideoChannel(candidate));
  candidate.add_video_configs()->CopyFrom(observed.video_configs(0));
  assert(!airplay_aa::isH264VideoChannel(candidate)); // Sender selects config index 0.
  candidate = observed;
  candidate.mutable_video_configs(0)->set_codec(999);
  assert(!airplay_aa::isH264VideoChannel(candidate));
  candidate = observed;
  candidate.clear_video_configs();
  candidate.set_media_type(tag::aas::MediaStreamType::Video);
  assert(!airplay_aa::isH264VideoChannel(candidate));
  candidate = observed;
  candidate.mutable_video_configs(0)->set_video_resolution(tag::aas::VideoResolution::None);
  assert(!airplay_aa::isH264VideoChannel(candidate));
  candidate = observed;
  candidate.mutable_video_configs(0)->clear_codec(); // Legacy H.264 descriptors lack tag 10.
  assert(airplay_aa::isH264VideoChannel(candidate));
  // An unknown explicit proto2 enum is stored as unknown data, not "omitted".
  candidate = observed;
  const auto unknownType = candidate.SerializeAsString() + std::string("\x08\xe7\x07", 3);
  assert(candidate.ParseFromString(unknownType));
  assert(!candidate.has_media_type());
  assert(!airplay_aa::isH264VideoChannel(candidate));

  // Truncation must fail before partially decoded descriptors are acted upon.
  assert(!discovery.ParseFromString(wire.substr(0, wire.size() - 1)));
  std::cout << "Service discovery compatibility and codec tests passed\n";
}
