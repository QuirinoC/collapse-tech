// Compile and exercise the production video/base handlers and generated schemas.
// USB/TLS and optional legacy GStreamer SHM are outside this local harness.
#include "VideoChannelHandler.h"
#include "enums.h"
#include <algorithm>
#include <cassert>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <future>
#include <iostream>
#include <mutex>
#include <thread>

using Bytes = std::vector<uint8_t>;
struct Sent { uint8_t channel; uint8_t flags; Bytes data; };
static uint16_t type(const Bytes &data) {
  assert(data.size() >= 2);
  return uint16_t(data[0]) << 8 | data[1];
}
static const Bytes media{0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0x65};
static const Bytes ok{0x80, 0x03, 0x08, 0x02, 0x10, 0x10, 0x18, 0x00};

struct Fixture {
  VideoChannelHandler handler;
  uint8_t channelId;
  Bytes setup;
  Bytes openResponse{0, 8, 8, 0};
  std::mutex mutex;
  std::vector<Sent> sent;
  std::function<void(uint16_t)> observe;
  explicit Fixture(Bytes setupBody = ok, uint8_t channel = 1)
      : handler(channel), channelId(channel), setup(std::move(setupBody)) {
    handler.sendToHeadunit.connect([this](uint8_t ch, uint8_t flags, Bytes data) {
      const auto id = type(data);
      {
        std::lock_guard<std::mutex> lock(mutex);
        sent.push_back({ch, flags, data});
      }
      if (observe) observe(id);
      if (id == 7) receive(openResponse, ch);
      if (id == 0x8000) receive(setup, ch);
    });
  }
  void receive(Bytes body, uint8_t channel = 0) {
    Message message;
    message.channel = channel ? channel : channelId;
    message.flags = 0x0b;
    message.content = std::move(body);
    handler.handleMessageFromHeadunit(message);
  }
  void focus(uint8_t mode) { receive({0x80, 8, 8, mode, 0x10, 1}); }
  void frame(uint8_t channel = 0) {
    assert(handler.handleMessageFromClient(9, channel ? channel : channelId, false, media));
  }
  void picture(bool idr) {
    auto body = media;
    body.back() = idr ? 0x65 : 0x41;
    assert(handler.handleMessageFromClient(9, channelId, false, body));
  }
  void ack(uint8_t count, uint8_t session = 0) {
    receive({0x80, 4, 8, session, 0x10, count});
  }
  std::vector<Sent> snapshot() {
    std::lock_guard<std::mutex> lock(mutex);
    return sent;
  }
  void ids(std::initializer_list<uint16_t> expected) {
    auto messages = snapshot();
    assert(messages.size() == expected.size());
    size_t i = 0;
    for (auto id : expected) assert(type(messages[i++].data) == id);
  }
};

static void passiveFocusAndOrdering() {
  Fixture fixture;
  fixture.frame();
  fixture.ids({7, 0x8000, 0x8007});
  const auto requests = fixture.snapshot();
  assert(requests[0].flags == 0x0f);
  assert(requests[1].data == Bytes({0x80, 0, 8, 3}));
  assert(requests[1].flags == 0x0b);
  assert(requests[2].data == Bytes({0x80, 7, 0x10, 1, 0x18, 4}));
  assert(requests[2].flags == 0x0b); // service-specific bit 0x04 is CLEAR.
  const auto began = std::chrono::steady_clock::now();
  for (int i = 0; i < 64; ++i) fixture.frame();
  assert(std::chrono::steady_clock::now() - began < std::chrono::seconds(1));
  fixture.ids({7, 0x8000, 0x8007}); // Passive HU never grants: hold media.
  fixture.focus(1);
  fixture.frame();
  fixture.ids({7, 0x8000, 0x8007, 0x8001, 0});
  auto granted = fixture.snapshot();
  assert(granted[3].data == Bytes({0x80, 1, 8, 0, 0x10, 0}));
  assert(granted[3].flags == 0x0b && granted[4].flags == 0x0b);
  fixture.focus(1);
  fixture.receive(ok);
  fixture.ids({7, 0x8000, 0x8007, 0x8001, 0}); // No duplicate Start/request.
  for (uint8_t nativeMode : {2, 3, 0}) {
    fixture.focus(nativeMode);
    const auto before = fixture.snapshot().size();
    fixture.frame();
    fixture.receive(ok);
    assert(fixture.snapshot().size() == before); // Respect native focus.
  }
  fixture.focus(4);
  fixture.frame();
  fixture.ids({7, 0x8000, 0x8007, 0x8001, 0, 0x8002, 0x8001, 0});
  fixture.receive({0x80}); // Must not reach base handler's uint16 read.
  fixture.receive({0x80, 8}); // Focus missing its mode is ignored.
  fixture.receive({0x80, 8, 8, 0x80}); // Truncated protobuf is ignored.
  fixture.ids({7, 0x8000, 0x8007, 0x8001, 0, 0x8002, 0x8001, 0});
}

static void setupRejectionsAreTerminal() {
  const std::vector<Bytes> rejected{
      {0x80, 3, 8, 1, 0x10, 0, 0x18, 0}, // Explicit FAIL.
      {0x80, 3, 8, 0, 0x10, 0, 0x18, 0}, // NONE is not accepted.
      {0x80, 3, 8, 2, 0x10, 0x10, 0x18, 1}, // Config 0 not accepted.
      {0x80, 3, 8, 2, 0x10, 0x10}, // Empty supported configs.
      {0x80, 3, 0x10, 0x10, 0x18, 0}, // Required status omitted.
      {0x80, 3, 8, 2, 0x18, 0}, // Required max_unacked omitted.
      {0x80, 3, 8, 2, 0x10, 0, 0x18, 0}, // Zero credit cannot start a stream.
      {0x80, 3, 8, 0x80} // Truncated wire.
  };
  for (const auto &response : rejected) {
    Fixture fixture(response);
    fixture.frame();
    fixture.focus(1);
    const auto began = std::chrono::steady_clock::now();
    for (int i = 0; i < 64; ++i) fixture.frame();
    assert(std::chrono::steady_clock::now() - began < std::chrono::seconds(1));
    fixture.receive(ok); // A later contradictory response cannot revive it.
    fixture.frame();
    fixture.ids({7, 0x8000});
  }
}

static void channelOpenRejectionsAreTerminal() {
  for (const Bytes &response : std::vector<Bytes>{
        {0, 8, 8, 1}, {0, 8}, {0, 8, 8, 0x80}, {0, 8, 0x10, 0}}) {
    Fixture fixture;
    fixture.openResponse = response;
    fixture.frame();
    fixture.focus(1);
    fixture.receive({0, 8, 8, 0}); // No unsolicited success can revive rejection.
    fixture.receive(ok);
    for (int i = 0; i < 20; ++i) fixture.frame();
    fixture.ids({7});
  }
}

static Bytes window(uint8_t size) { return {0x80, 3, 8, 2, 0x10, size, 0x18, 0}; }

static size_t countMedia(Fixture &fixture) {
  auto messages = fixture.snapshot();
  return std::count_if(messages.begin(), messages.end(), [](const Sent &m) {
    return type(m.data) == 0 || type(m.data) == 1;
  });
}

static void negotiatedCreditAndIdrRecovery() {
  Fixture fixture(window(4)); // Actual Mazda advertised max_unacked=4.
  fixture.frame();
  fixture.focus(1);
  fixture.picture(false); // A newly started decoder needs a keyframe.
  assert(countMedia(fixture) == 0);
  fixture.picture(true);
  for (int i = 0; i < 3; ++i) fixture.picture(false);
  assert(countMedia(fixture) == 4);
  fixture.picture(false); // Full window drops this AU, breaking its GOP.
  fixture.picture(true);
  assert(countMedia(fixture) == 4);
  fixture.ack(2);
  fixture.picture(false); // ACK alone cannot repair the dropped reference frame.
  assert(countMedia(fixture) == 4);
  fixture.picture(true);
  fixture.picture(false);
  assert(countMedia(fixture) == 6); // Two ACKed messages, exactly two slots.
  fixture.frame();
  assert(countMedia(fixture) == 6);
  fixture.ack(127); // Saturate at zero; cannot create more than four slots.
  for (int i = 0; i < 20; ++i) fixture.frame();
  assert(countMedia(fixture) == 10);
}

static void ackValidationAndResumeSessions() {
  Fixture fixture(window(1));
  fixture.frame();
  fixture.focus(1);
  fixture.frame();
  for (const Bytes &ack : std::vector<Bytes>{
        {0x80, 4}, {0x80, 4, 8, 0}, {0x80, 4, 0x10, 1},
        {0x80, 4, 8, 0, 0x10, 0}, {0x80, 4, 8, 0, 0x10, 0x80},
        {0x80, 4, 8, 1, 0x10, 1}}) {
    fixture.receive(ack);
    fixture.frame();
    assert(countMedia(fixture) == 1);
  }
  fixture.receive({0x80, 4, 8, 0, 0x10, 1}, 2); // Wrong channel.
  fixture.frame();
  assert(countMedia(fixture) == 1);
  fixture.focus(2); // HU may discard old media and never ACK it after stop.
  fixture.focus(1); // Fresh session must have an independent window.
  const auto sent = fixture.snapshot();
  assert(sent.back().data == Bytes({0x80, 1, 8, 1, 0x10, 0}));
  fixture.frame();
  assert(countMedia(fixture) == 2);
  fixture.ack(1, 0); // Late ACK from prior stream must not release new credit.
  fixture.frame();
  assert(countMedia(fixture) == 2);
  fixture.ack(1, 1);
  fixture.frame();
  assert(countMedia(fixture) == 3);
}

static void timestampAcksAndConcurrentWindow() {
  Fixture fixture(window(4));
  fixture.frame();
  fixture.focus(1);
  std::vector<std::future<void>> writers;
  for (int i = 0; i < 16; ++i)
    writers.push_back(std::async(std::launch::async, [&] { fixture.frame(); }));
  for (auto &writer : writers) writer.get();
  assert(countMedia(fixture) == 4);
  // Two timestamps take precedence over the oversized legacy count.
  fixture.receive({0x80, 4, 8, 0, 0x10, 100, 0x18, 1, 0x18, 2});
  for (int i = 0; i < 8; ++i) fixture.frame();
  assert(countMedia(fixture) == 6);
  fixture.receive({0x80, 4, 8, 0, 0x1a, 2, 3, 4}); // Packed timestamps.
  for (int i = 0; i < 8; ++i) fixture.frame();
  assert(countMedia(fixture) == 8);

  Fixture immediate(window(1));
  immediate.frame();
  immediate.focus(1);
  immediate.observe = [&](uint16_t id) { if (id == 0) immediate.ack(1); };
  for (int i = 0; i < 32; ++i) immediate.frame();
  assert(countMedia(immediate) == 32); // Credit reserved before synchronous ACK.
}

static void creditCountsCompleteMediaMessages() {
  Fixture fixture(window(1));
  fixture.frame();
  fixture.focus(1);
  // The first injector AU has no timestamp. It still consumes one media slot.
  const Bytes untimestamped{0, 1, 0, 0, 0, 1, 0x65};
  assert(fixture.handler.handleMessageFromClient(9, 1, false, untimestamped));
  fixture.frame();
  assert(countMedia(fixture) == 1);
  fixture.ack(1);
  // A large AU will become several transport fragments downstream, but its
  // one media ACK must suffice to release the one reserved window slot.
  auto large = media;
  large.resize(16000, 0x55);
  assert(fixture.handler.handleMessageFromClient(9, 1, false, large));
  fixture.frame();
  assert(countMedia(fixture) == 2);
  fixture.ack(1);
  fixture.frame();
  assert(countMedia(fixture) == 3);
}

static void packedConfigsAndFreshHandler() {
  for (const auto &response : std::vector<Bytes>{
        {0x80, 3, 8, 2, 0x10, 0x10, 0x1a, 2, 2, 0},
        {0x80, 3, 8, 2, 0x10, 0x10, 0x18, 2, 0x18, 0}}) {
    Fixture fixture(response, 2);
    fixture.frame(2);
    fixture.ids({7, 0x8000, 0x8007});
    fixture.focus(4);
    fixture.frame(2);
    fixture.ids({7, 0x8000, 0x8007, 0x8001, 0});
    for (const auto &message : fixture.snapshot()) assert(message.channel == 2);
  }
  Fixture fresh;
  fresh.frame();
  fresh.ids({7, 0x8000, 0x8007}); // New AA session has fresh focus state.
}

static void earlyHeadunitFocusIsRespected() {
  for (uint8_t mode : {1, 2, 3, 4}) {
    for (bool beforeOpen : {false, true}) {
      Fixture fixture;
      if (beforeOpen) fixture.focus(mode);
      else fixture.observe = [&](uint16_t id) {
        if (id == 0x8000) fixture.focus(mode);
      };
      fixture.frame();
      if (mode == 1 || mode == 4) {
        fixture.ids({7, 0x8000, 0x8001, 0});
      } else {
        fixture.ids({7, 0x8000}); // Native decision before setup holds media.
        fixture.focus(1);
        fixture.frame();
        fixture.ids({7, 0x8000, 0x8001, 0});
      }
    }
  }
}

static void concurrentStartPrecedesMedia() {
  Fixture fixture;
  fixture.frame();
  std::promise<void> entered, release;
  auto released = release.get_future().share();
  fixture.observe = [&](uint16_t id) {
    if (id == 0x8001) { entered.set_value(); released.wait(); }
  };
  auto start = std::async(std::launch::async, [&] { fixture.focus(1); });
  assert(entered.get_future().wait_for(std::chrono::seconds(1)) == std::future_status::ready);
  auto mediaSend = std::async(std::launch::async, [&] { fixture.frame(); });
  assert(mediaSend.wait_for(std::chrono::milliseconds(50)) == std::future_status::timeout);
  fixture.ids({7, 0x8000, 0x8007, 0x8001});
  release.set_value();
  start.get();
  mediaSend.get();
  fixture.ids({7, 0x8000, 0x8007, 0x8001, 0});
}

int main() {
  unsetenv("AIRPLAY_AA_SHM");
  passiveFocusAndOrdering();
  setupRejectionsAreTerminal();
  packedConfigsAndFreshHandler();
  earlyHeadunitFocusIsRespected();
  concurrentStartPrecedesMedia();
  channelOpenRejectionsAreTerminal();
  negotiatedCreditAndIdrRecovery();
  ackValidationAndResumeSessions();
  timestampAcksAndConcurrentWindow();
  creditCountsCompleteMediaMessages();
  std::cout << "video focus actual-handler tests passed" << std::endl;
}
