// Distributed under GPLv3 only as specified in AACS repository LICENSE.
#pragma once

#include "ChannelHandler.h"
#include <cstdint>
#include <gst/gst.h>
#include <mutex>

class VideoChannelHandler : public ChannelHandler {
  bool gotSetupResponse = false;
  bool setupResponseReceived = false;
  bool channelOpened = false;
  bool focusRequested = false;
  bool focusIndicationReceived = false;
  bool streamStarted = false;
  uint32_t focusMode = 0;
  std::mutex m;
  std::condition_variable cv;
  // Every outgoing video message is serialized so Start precedes media.
  std::mutex sendMutex;
  GstElement *pipeline = nullptr;

  void sendSetupRequest();
  void expectSetupResponse();
  void sendFocusRequest();
  void sendStartIndication();
  static GstFlowReturn new_sample(GstElement *sink, VideoChannelHandler *self);
  void openChannel();

public:
  explicit VideoChannelHandler(uint8_t channelId);
  void disconnected(int clientId) override;
  bool handleMessageFromHeadunit(const Message &message) override;
  bool handleMessageFromClient(int clientId, uint8_t channelId, bool specific,
                              const std::vector<uint8_t> &data) override;
  ~VideoChannelHandler() override;
};
