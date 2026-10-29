// Distributed under GPLv3 only as specified in repository's root LICENSE file
#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <utility>
#include <vector>

namespace airplay_aa {

// USB reads are byte chunks, not AA message boundaries. AA First frames carry
// an extra big-endian total *plaintext* size; each fragment is independently
// encrypted. Decrypt frames in wire order, then dispatch the assembled message.
// Size/encryption follow aasdk's MessageInStream/MessageOutStream. Independent
// channel assemblies also support behead's per-channel Session::reassemble.
class AaFrameReceiver {
public:
  static constexpr size_t MaxMessageSize = 1024 * 1024;
  static constexpr size_t MaxPendingMessageBytes = 4 * MaxMessageSize;

  template <class Decrypt, class Dispatch>
  void consume(const void *data, size_t length, Decrypt decrypt, Dispatch dispatch) {
    const auto *bytes = static_cast<const uint8_t *>(data);
    while (length) {
      size_t needed = 4;
      if (wire.size() >= 4) {
        const size_t header = (wire[1] & 3) == 1 ? 8 : 4;
        needed = header + (size_t(wire[2]) << 8) + wire[3];
        if (needed == header)
          throw std::runtime_error("AA frame has an empty payload");
      }
      const auto count = std::min(length, needed - wire.size());
      wire.insert(wire.end(), bytes, bytes + count);
      bytes += count;
      length -= count;
      if (wire.size() < 4)
        continue;
      const auto channel = wire[0];
      const auto flags = wire[1];
      const auto type = flags & 3;
      const size_t header = type == 1 ? 8 : 4;
      const size_t frameLength = (size_t(wire[2]) << 8) + wire[3];
      if (frameLength == 0)
        throw std::runtime_error("AA frame has an empty payload");
      if (wire.size() != header + frameLength)
        continue;

      auto &partial = messages[channel];
      const auto stableFlags = flags & ~3;
      if (type == 1 || type == 3) {
        if (partial.active)
          throw std::runtime_error("AA message interrupted before its last fragment");
      } else if (!partial.active || stableFlags != partial.flags) {
        throw std::runtime_error("AA continuation does not match an active message");
      }
      if (type == 1) {
        const size_t expected = (uint32_t(wire[4]) << 24) | (uint32_t(wire[5]) << 16) |
                                (uint32_t(wire[6]) << 8) | uint32_t(wire[7]);
        if (expected < 2 || expected > MaxMessageSize)
          throw std::runtime_error("AA fragmented message size is out of bounds");
        if (expected > MaxPendingMessageBytes - reservedMessageBytes)
          throw std::runtime_error("AA pending messages exceed the memory limit");
        partial.expected = expected;
        partial.bytes.reserve(expected);
        reservedMessageBytes += expected;
        partial.active = true;
        partial.flags = stableFlags;
      }
      std::vector<uint8_t> payload(wire.begin() + header, wire.end());
      if (flags & 8)
        payload = decrypt(payload);
      wire.clear();
      if (type == 3) {
        if (payload.size() < 2 || payload.size() > MaxMessageSize)
          throw std::runtime_error("AA message size is out of bounds");
        dispatch(channel, flags, payload);
        continue;
      }
      if (payload.empty() || payload.size() > partial.expected - partial.bytes.size())
        throw std::runtime_error("AA fragment exceeds declared message size");
      partial.bytes.insert(partial.bytes.end(), payload.begin(), payload.end());
      if (type == 2) {
        if (partial.bytes.size() != partial.expected)
          throw std::runtime_error("AA last fragment does not complete declared size");
        reservedMessageBytes -= partial.expected;
        auto completed = std::move(partial.bytes);
        const auto completedFlags = static_cast<uint8_t>(partial.flags | 3);
        partial = PartialMessage{};
        dispatch(channel, completedFlags, completed);
      } else if (partial.bytes.size() == partial.expected) {
        throw std::runtime_error("AA fragmented message reached its size before Last");
      }
    }
  }

private:
  struct PartialMessage {
    std::vector<uint8_t> bytes;
    size_t expected = 0;
    uint8_t flags = 0;
    bool active = false;
  };
  std::vector<uint8_t> wire;
  std::array<PartialMessage, 256> messages;
  size_t reservedMessageBytes = 0;
};

} // namespace airplay_aa
