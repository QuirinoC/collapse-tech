// Distributed under GPLv3 only as specified in repository's root LICENSE file
// AirPlay-AA: bounded wait for ChannelOpenResponse (video channel).

#include "ChannelHandler.h"
#include "ChannelOpenRequest.pb.h"
#include "enums.h"
#include "utils.h"
#include <chrono>
#include <iostream>
#include <linux/types.h>

ChannelHandler::ChannelHandler(uint8_t _channelId) : channelId(_channelId) {}
ChannelHandler::~ChannelHandler() {}

void ChannelHandler::openChannel() {
  gotChannelOpenResponse = false;
  sendChannelOpenRequest();
  expectChannelOpenResponse();
}

bool ChannelHandler::openChannelWithTimeout(int timeout_ms) {
  gotChannelOpenResponse = false;
  sendChannelOpenRequest();
  std::unique_lock<std::mutex> lk(m);
  const bool ok = cv.wait_for(lk, std::chrono::milliseconds(timeout_ms),
                              [=] { return gotChannelOpenResponse; });
  if (!ok) {
    static bool logged = false;
    if (!logged) {
      logged = true;
      std::cout << "ChannelHandler: timed out after " << timeout_ms
                << "ms waiting for ChannelOpenResponse on channel "
                << static_cast<int>(channelId) << std::endl;
    }
  }
  return ok;
}

bool ChannelHandler::handleMessageFromHeadunit(const Message &message) {
  bool messageHandled = false;
  {
    std::unique_lock<std::mutex> lk(m);
    auto msg = message.content;
    const __u16 *shortView = (const __u16 *)(msg.data());
    auto messageType = be16_to_cpu(shortView[0]);
    if (messageType == MessageType::ChannelOpenResponse) {
      gotChannelOpenResponse = true;
      messageHandled = true;
    }
  }
  cv.notify_all();
  return messageHandled;
}

void ChannelHandler::sendChannelOpenRequest() {
  tag::aas::ChannelOpenRequest cor;
  cor.set_channel_id(channelId);
  cor.set_unknown_field(0);
  const auto &msgString = cor.SerializeAsString();
  std::vector<uint8_t> plainMsg;
  pushBackInt16(plainMsg, MessageType::ChannelOpenRequest);
  std::copy(msgString.begin(), msgString.end(), std::back_inserter(plainMsg));
  sendToHeadunit(channelId,
                 FrameType::Bulk | EncryptionType::Encrypted |
                     MessageTypeFlags::Specific,
                 plainMsg);
}

void ChannelHandler::expectChannelOpenResponse() {
  std::unique_lock<std::mutex> lk(m);
  cv.wait(lk, [=] { return gotChannelOpenResponse; });
}

void ChannelHandler::disconnected(int clientId) {}
