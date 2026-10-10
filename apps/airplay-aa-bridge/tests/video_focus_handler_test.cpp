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
  Bytes setup;
  std::mutex mutex;
  std::vector<Sent> sent;
  std::function<void(uint16_t)> observe;
  explicit Fixture(Bytes setupBody = ok, uint8_t channel = 1)
      : handler(channel), setup(std::move(setupBody)) {
    handler.sendToHeadunit.connect([this](uint8_t ch, uint8_t flags, Bytes data) {
      const auto id = type(data);
      {
        std::lock_guard<std::mutex> lock(mutex);
        sent.push_back({ch, flags, data});
      }
      if (observe) observe(id);
      if (id == 7) receive({0, 8, 8, 0}, ch);
      if (id == 0x8000) receive(setup, ch);
    });
  }
  void receive(Bytes body, uint8_t channel = 1) {
    Message message;
    message.channel = channel;
    message.flags = 0x0b;
    message.content = std::move(body);
    handler.handleMessageFromHeadunit(message);
  }
  void focus(uint8_t mode) { receive({0x80, 8, 8, mode, 0x10, 1}); }
  void frame(uint8_t channel = 1) {
    assert(handler.handleMessageFromClient(9, channel, false, media));
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
  fixture.ids({7, 0x8000, 0x8007, 0x8001, 0, 0x8001, 0});
  fixture.receive({0x80}); // Must not reach base handler's uint16 read.
  fixture.receive({0x80, 8}); // Focus missing its mode is ignored.
  fixture.receive({0x80, 8, 8, 0x80}); // Truncated protobuf is ignored.
  fixture.ids({7, 0x8000, 0x8007, 0x8001, 0, 0x8001, 0});
}

static void setupRejectionsAreTerminal() {
  const std::vector<Bytes> rejected{
      {0x80, 3, 8, 1, 0x10, 0, 0x18, 0}, // Explicit FAIL.
      {0x80, 3, 8, 0, 0x10, 0, 0x18, 0}, // NONE is not accepted.
      {0x80, 3, 8, 2, 0x10, 0x10, 0x18, 1}, // Config 0 not accepted.
      {0x80, 3, 8, 2, 0x10, 0x10}, // Empty supported configs.
      {0x80, 3, 0x10, 0x10, 0x18, 0}, // Required status omitted.
      {0x80, 3, 8, 2, 0x18, 0}, // Required max_unacked omitted.
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
  std::cout << "video focus actual-handler tests passed" << std::endl;
}
