// Distributed under GPLv3 only as specified in repository's root LICENSE file
// AirPlay-AA: initialize input from the client thread with bounded, strict waits.

#pragma once

#include "ChannelHandler.h"
#include <set>
#include <vector>

class InputChannelHandler : public ChannelHandler {
  enum class State { Initial, Opening, Opened, Binding, Ready, Failed };
  State state = State::Initial;
  std::mutex m;
  std::mutex initializationMutex;
  std::condition_variable cv;
  std::set<int> registered_clients;
  std::set<int> notified_clients;
  std::vector<int> available_buttons;
  std::vector<uint8_t> bindingResponse;
  int timeoutMs;
  void sendInputChannelOpenRequest();
  void sendHandshakeRequest();
  void initialize();
  void deliverCachedResponse(int clientId);

public:
  // The optional timeout is per handshake phase; production uses 2s + 2s.
  InputChannelHandler(uint8_t channelId, std::vector<int> available_buttons,
                      int timeoutMs = 2000);
  virtual void disconnected(int clientId) override;
  virtual bool handleMessageFromHeadunit(const Message &message) override;
  virtual bool handleMessageFromClient(int clientId, uint8_t channelId, bool specific,
                          const std::vector<uint8_t> &data) override;
  virtual ~InputChannelHandler();
};
