// Exercise the production receiver without OpenSSL or USB hardware.
#include "AaFrameReceiver.h"
#include <cassert>
#include <iostream>
#include <vector>

namespace {
using Bytes = std::vector<uint8_t>;
Bytes frame(uint8_t flags, const Bytes &body, uint32_t total = 0, uint8_t channel = 0) {
  Bytes result{channel, flags, static_cast<uint8_t>(body.size() >> 8),
               static_cast<uint8_t>(body.size())};
  if ((flags & 3) == 1)
    for (int shift : {24, 16, 8, 0}) result.push_back(total >> shift);
  result.insert(result.end(), body.begin(), body.end());
  return result;
}
Bytes join(const Bytes &a, const Bytes &b) {
  Bytes result = a; result.insert(result.end(), b.begin(), b.end()); return result;
}
template <class F> bool fails(F f) {
  try { f(); } catch (const std::runtime_error &) { return true; }
  return false;
}
struct Fixture {
  airplay_aa::AaFrameReceiver receiver;
  std::vector<Bytes> messages, encrypted;
  std::vector<uint8_t> channels, flags;
  void feed(const void *data, size_t size) {
    receiver.consume(data, size,
      [&](const Bytes &bytes) { encrypted.push_back(bytes); return bytes; },
      [&](uint8_t channel, uint8_t flag, const Bytes &bytes) {
        channels.push_back(channel); flags.push_back(flag); messages.push_back(bytes);
      });
  }
  void feed(const Bytes &bytes) { feed(bytes.data(), bytes.size()); }
};
}
int main() {
  const Bytes first{0, 6, 8, 42}, second{0, 13, 8, 43};
  const auto adjacent = join(frame(3, first), frame(0x0f, second, 0, 2));
  // Every possible read boundary, including inside the header and the payload.
  for (size_t split = 0; split <= adjacent.size(); ++split) {
    Fixture f;
    f.feed(adjacent.data(), split);
    f.feed(adjacent.data() + split, adjacent.size() - split);
    assert(f.messages == std::vector<Bytes>({first, second}));
    assert(f.channels == Bytes({0, 2}) && f.flags == Bytes({3, 15}));
    assert(f.encrypted == std::vector<Bytes>({second}));
  }
  // A First frame's extra size word must never enter the decryptor. Each
  // fragment is decrypted before plaintext reassembly, with one final delivery.
  const auto fragmented = join(join(frame(9, {0, 6}, 6), frame(8, {8, 42})),
                               frame(10, {16, 1}));
  for (size_t width : {size_t(1), size_t(2), size_t(7), size_t(100)}) {
    Fixture f;
    for (size_t offset = 0; offset < fragmented.size(); offset += width) {
      f.feed(fragmented.data() + offset, std::min(width, fragmented.size() - offset));
      if (offset + width < fragmented.size()) assert(f.messages.empty());
    }
    assert(f.messages == std::vector<Bytes>({{0, 6, 8, 42, 16, 1}}));
    assert(f.encrypted == std::vector<Bytes>({{0, 6}, {8, 42}, {16, 1}}));
    assert(f.flags == Bytes({11}));
  }
  // Truncated chunks wait safely instead of reading missing header bytes.
  for (size_t length = 0; length < fragmented.size(); ++length) {
    Fixture f; f.feed(fragmented.data(), length); assert(f.messages.empty());
  }
  // Control and other channels can make progress while a message is fragmented.
  // TLS callbacks must still run in arrival order, not assembly completion order.
  {
    Fixture f;
    f.feed(frame(9, {0, 6}, 6, 1));
    f.feed(frame(11, second, 0, 0));
    f.feed(frame(13, {0, 8}, 4, 2));
    f.feed(frame(8, {8, 42}, 0, 1));
    f.feed(frame(14, {8, 0}, 0, 2));
    f.feed(frame(10, {16, 1}, 0, 1));
    assert(f.channels == Bytes({0, 2, 1}));
    assert(f.flags == Bytes({11, 15, 11}));
    assert(f.messages == std::vector<Bytes>({second, {0, 8, 8, 0}, {0, 6, 8, 42, 16, 1}}));
    assert(f.encrypted == std::vector<Bytes>({{0, 6}, second, {0, 8}, {8, 42}, {8, 0}, {16, 1}}));
  }
  // The aggregate declared size, not merely bytes received so far, is bounded.
  {
    Fixture f;
    for (uint8_t channel = 0; channel < 4; ++channel)
      f.feed(frame(1, {0, 6}, airplay_aa::AaFrameReceiver::MaxMessageSize, channel));
    assert(fails([&] { f.feed(frame(1, {0, 6}, 3, 4)); }));
    assert(f.messages.empty());
  }
  // Completing one channel releases its reservation for a later fragmented
  // message; finished channels must not accumulate retained vector capacities.
  {
    Fixture f;
    const Bytes block(65535, 0x55);
    for (uint8_t channel = 0; channel < 8; ++channel) {
      f.feed(frame(1, {0, 6}, 16 * block.size() + 2, channel));
      for (int n = 0; n < 16; ++n)
        f.feed(frame(n == 15 ? 2 : 0, block, 0, channel));
    }
    assert(f.messages.size() == 8);
  }
  // Malformed ordering, lengths, channels and flags fail before dispatch.
  const auto start = frame(1, {0, 6}, 6);
  for (const auto &bytes : std::vector<Bytes>{
       frame(0, first), frame(2, first), frame(3, {}), frame(3, {0}),
       frame(1, first, 0), frame(1, first, 0xffffffff),
       join(start, frame(1, {8, 42}, 4)), join(start, frame(3, second)),
       join(start, frame(2, {8, 42}, 0, 1)), join(start, frame(10, {8, 42})),
       join(start, frame(2, {8, 42})), join(start, frame(2, {1, 2, 3, 4, 5})),
       join(start, frame(0, {1, 2, 3, 4}))}) {
    Fixture f; assert(fails([&] { f.feed(bytes); })); assert(f.messages.empty());
  }
  std::cout << "AA receive byte-stream and message-fragment tests passed\n";
}
