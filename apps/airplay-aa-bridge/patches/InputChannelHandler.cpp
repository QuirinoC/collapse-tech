// Distributed under GPLv3 only as specified in repository's root LICENSE file
// Initialize input before video without blocking the head-unit receive thread.
#include "InputChannelHandler.h"
#include "ChannelOpenRequest.pb.h"
#include "InputBinding.pb.h"
#include <chrono>
#include <iostream>
#include <utility>

namespace {
constexpr uint16_t ChannelOpenRequestId = 7;
constexpr uint16_t ChannelOpenResponseId = 8;
constexpr uint16_t InputEventId = 0x8001;
constexpr uint16_t InputBindingRequestId = 0x8002;
constexpr uint16_t InputBindingResponseId = 0x8003;

template <typename Proto>
std::vector<uint8_t> packet(uint16_t type, const Proto &body) {
  const auto bytes = body.SerializeAsString();
  std::vector<uint8_t> result{static_cast<uint8_t>(type >> 8),
                              static_cast<uint8_t>(type)};
  result.insert(result.end(), bytes.begin(), bytes.end());
  return result;
}
}

InputChannelHandler::InputChannelHandler(uint8_t id, std::vector<int> buttons,
                                         int phaseTimeoutMs)
    : ChannelHandler(id), available_buttons(std::move(buttons)),
      timeoutMs(phaseTimeoutMs > 0 ? phaseTimeoutMs : 2000) {}

InputChannelHandler::~InputChannelHandler() = default;

void InputChannelHandler::sendInputChannelOpenRequest() {
  tag::aas::ChannelOpenRequest request;
  request.set_unknown_field(0);
  request.set_channel_id(channelId);
  // Bulk + encrypted + control bit. AACS names the control bit "Specific".
  sendToHeadunit(channelId, 0x0f, packet(ChannelOpenRequestId, request));
}

void InputChannelHandler::sendHandshakeRequest() {
  tag::aas::InputBindingRequest request;
  for (int button : available_buttons) request.add_keycodes(button);
  sendToHeadunit(channelId, 0x0b, packet(InputBindingRequestId, request));
}

void InputChannelHandler::initialize() {
  // Only Unix client threads enter this function. RX only changes state/notifies.
  std::lock_guard<std::mutex> initialization(initializationMutex);
  {
    std::lock_guard<std::mutex> lock(m);
    if (state != State::Initial) return;
    state = State::Opening;
  }
  sendInputChannelOpenRequest();
  {
    std::unique_lock<std::mutex> lock(m);
    if (!cv.wait_for(lock, std::chrono::milliseconds(timeoutMs),
                     [this] { return state != State::Opening; })) {
      state = State::Failed;
      std::cout << "InputChannelHandler: channel " << int(channelId)
                << " open timed out after " << timeoutMs << "ms" << std::endl;
      return;
    }
    if (state != State::Opened) return;
    state = State::Binding;
  }
  sendHandshakeRequest();
  {
    std::unique_lock<std::mutex> lock(m);
    if (!cv.wait_for(lock, std::chrono::milliseconds(timeoutMs),
                     [this] { return state != State::Binding; })) {
      state = State::Failed;
      std::cout << "InputChannelHandler: channel " << int(channelId)
                << " binding timed out after " << timeoutMs << "ms" << std::endl;
    }
  }
}

void InputChannelHandler::deliverCachedResponse(int clientId) {
  std::vector<uint8_t> response;
  {
    std::lock_guard<std::mutex> lock(m);
    if (!bindingResponse.empty() && registered_clients.count(clientId) &&
        notified_clients.insert(clientId).second)
      response = bindingResponse;
  }
  if (!response.empty()) sendToClient(clientId, channelId, false, response);
}

bool InputChannelHandler::handleMessageFromClient(int clientId, uint8_t channel,
                                                  bool /*specific*/,
                                                  const std::vector<uint8_t> & /*data*/) {
  if (channel != channelId) return false;
  {
    std::lock_guard<std::mutex> lock(m);
    registered_clients.insert(clientId);
  }
  initialize();
  deliverCachedResponse(clientId);
  return true;
}

bool InputChannelHandler::handleMessageFromHeadunit(const Message &message) {
  const auto &body = message.content;
  if (body.size() < 2) return false;
  const uint16_t type = uint16_t(body[0]) << 8 | body[1];
  const auto payload = body.data() + 2;
  const auto payloadSize = static_cast<int>(body.size() - 2);
  if (type == ChannelOpenResponseId) {
    tag::aas::InputChannelOpenResponse response;
    const bool parsed = response.ParseFromArray(payload, payloadSize);
    {
      std::lock_guard<std::mutex> lock(m);
      if (state != State::Opening) return true;
      const bool accepted = parsed && response.status() == 0;
      state = accepted ? State::Opened : State::Failed;
      std::cout << "InputChannelHandler: channel " << int(channelId)
                << " ChannelOpenResponse parsed=" << parsed
                << " status=" << (parsed ? response.status() : -1)
                << " accepted=" << accepted << std::endl;
    }
    cv.notify_all();
    return true;
  }
  if (type == InputBindingResponseId) {
    tag::aas::InputBindingResponse response;
    const bool parsed = response.ParseFromArray(payload, payloadSize);
    std::set<int> recipients;
    {
      std::lock_guard<std::mutex> lock(m);
      if (state != State::Binding) return true;
      const bool accepted = parsed && response.status() == 0;
      state = accepted ? State::Ready : State::Failed;
      bindingResponse = body;
      recipients = registered_clients;
      notified_clients.insert(recipients.begin(), recipients.end());
      std::cout << "InputChannelHandler: channel " << int(channelId)
                << " InputBindingResponse parsed=" << parsed
                << " status=" << (parsed ? response.status() : -1)
                << " accepted=" << accepted << std::endl;
    }
    cv.notify_all();
    // Preserve the real HU response, including an explicit/malformed rejection.
    // Callbacks run outside the state mutex, so client disconnect can reenter.
    for (int clientId : recipients) sendToClient(clientId, channelId, false, body);
    return true;
  }
  if (type == InputEventId) {
    std::set<int> recipients;
    {
      std::lock_guard<std::mutex> lock(m);
      if (state == State::Ready) recipients = registered_clients;
    }
    for (int clientId : recipients) sendToClient(clientId, channelId, false, body);
    return true;
  }
  return false;
}

void InputChannelHandler::disconnected(int clientId) {
  std::lock_guard<std::mutex> lock(m);
  registered_clients.erase(clientId);
  notified_clients.erase(clientId);
}
