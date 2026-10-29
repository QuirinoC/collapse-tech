// Distributed under GPLv3 only as specified in repository's root LICENSE file
// AirPlay-AA: bounded wait for ChannelOpenResponse (video channel).

#include "ChannelHandler.h"
#include "ChannelOpenRequest.pb.h"
#include "ChannelOpenResponse.pb.h"
#include "enums.h"
#include "utils.h"
#include <chrono>
#include <iostream>
#include <linux/types.h>
#include <stdexcept>

ChannelHandler::ChannelHandler(uint8_t _channelId) : channelId(_channelId) {}
ChannelHandler::~ChannelHandler() {}

void ChannelHandler::openChannel() {
  {
    std::lock_guard<std::mutex> lock(m);
    gotChannelOpenResponse = false;
    channelOpenAccepted = false;
    channelOpenPending = true;
  }
  sendChannelOpenRequest();
  expectChannelOpenResponse();
}

bool ChannelHandler::openChannelWithTimeout(int timeout_ms) {
  {
    std::lock_guard<std::mutex> lock(m);
    gotChannelOpenResponse = false;
    channelOpenAccepted = false;
    channelOpenPending = true;
  }
  sendChannelOpenRequest();
  std::unique_lock<std::mutex> lk(m);
  const bool ok = cv.wait_for(lk, std::chrono::milliseconds(timeout_ms),
                              [=] { return gotChannelOpenResponse; });
  channelOpenPending = false;
  if (!ok) {
    static bool logged = false;
    if (!logged) {
      logged = true;
      std::cout << "ChannelHandler: timed out after " << timeout_ms
                << "ms waiting for ChannelOpenResponse on channel "
                << static_cast<int>(channelId) << std::endl;
    }
  }
  return ok && channelOpenAccepted;
}

bool ChannelHandler::channelOpenRejected() {
  std::lock_guard<std::mutex> lock(m);
  return gotChannelOpenResponse && !channelOpenAccepted;
}

bool ChannelHandler::handleMessageFromHeadunit(const Message &message) {
  if (message.channel != channelId || message.content.size() < 2)
    return false;
  bool messageHandled = false;
  {
    std::unique_lock<std::mutex> lk(m);
    auto msg = message.content;
    const auto messageType = (uint16_t(msg[0]) << 8) | msg[1];
    if (messageType == MessageType::ChannelOpenResponse) {
      messageHandled = true;
      if (channelOpenPending && !gotChannelOpenResponse) {
        tag::aas::ChannelOpenResponse response;
        const bool parsed = response.ParseFromArray(msg.data() + 2, msg.size() - 2);
        channelOpenAccepted = parsed && response.status() == 0;
        gotChannelOpenResponse = true;
        std::cout << "ChannelHandler: channel " << int(channelId)
                  << " ChannelOpenResponse parsed=" << parsed
                  << " status=" << (parsed ? response.status() : -1)
                  << " accepted=" << channelOpenAccepted << std::endl;
      }
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
  channelOpenPending = false;
  if (!channelOpenAccepted)
    throw std::runtime_error("head unit rejected channel open");
}

void ChannelHandler::disconnected(int clientId) {}
