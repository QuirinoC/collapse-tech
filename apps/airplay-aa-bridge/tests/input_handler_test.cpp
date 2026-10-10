// Exercise the real input/base handlers with generated production wire schemas.
#include "InputChannelHandler.h"
#include "ChannelOpenRequest.pb.h"
#include "InputBinding.pb.h"
#include "InputChannel.pb.h"
#include <algorithm>
#include <cassert>
#include <chrono>
#include <condition_variable>
#include <functional>
#include <future>
#include <iostream>
#include <mutex>

using Bytes = std::vector<uint8_t>;
static const Bytes opened{0, 8, 8, 0};
static const Bytes bound{0x80, 3, 8, 0};
static const Bytes event{0x80, 1, 0x08, 0x01};
static const std::vector<int> mazdaCodes{
    3, 4, 19, 20, 21, 22, 23, 84, 87, 88, 126,
    65536, 65537, 65538, 65540};
static uint16_t type(const Bytes &bytes) {
  assert(bytes.size() >= 2);
  return uint16_t(bytes[0]) << 8 | bytes[1];
}
struct Sent { uint8_t channel; uint8_t flags; Bytes body; };
struct Delivered { int client; uint8_t channel; bool specific; Bytes body; };

struct Fixture {
  InputChannelHandler handler;
  std::mutex mutex;
  std::condition_variable cv;
  std::vector<Sent> sent;
  std::vector<Delivered> delivered;
  Bytes openResponse = opened;
  Bytes bindingResponse = bound;
  bool answerOpen = true;
  bool answerBinding = true;
  std::function<void(int, const Bytes &)> observeClient;

  explicit Fixture(int timeout = 30) : handler(2, mazdaCodes, timeout) {
    handler.sendToHeadunit.connect([this](uint8_t channel, uint8_t flags, Bytes body) {
      const auto id = type(body);
      {
        std::lock_guard<std::mutex> lock(mutex);
        sent.push_back({channel, flags, std::move(body)});
      }
      cv.notify_all();
      if (id == 7 && answerOpen) receive(openResponse);
      if (id == 0x8002 && answerBinding) receive(bindingResponse);
    });
    handler.sendToClient.connect([this](int client, uint8_t channel, bool specific,
                                         Bytes body) {
      {
        std::lock_guard<std::mutex> lock(mutex);
        delivered.push_back({client, channel, specific, body});
      }
      if (observeClient) observeClient(client, body);
    });
  }
  bool receive(Bytes bytes) {
    Message message;
    message.content = std::move(bytes);
    return handler.handleMessageFromHeadunit(message);
  }
  void registration(int client = 9) {
    assert(handler.handleMessageFromClient(client, 2, false, {0}));
  }
  std::vector<Sent> sentSnapshot() {
    std::lock_guard<std::mutex> lock(mutex);
    return sent;
  }
  std::vector<Delivered> clientSnapshot() {
    std::lock_guard<std::mutex> lock(mutex);
    return delivered;
  }
  void waitSent(uint16_t id) {
    std::unique_lock<std::mutex> lock(mutex);
    assert(cv.wait_for(lock, std::chrono::seconds(1), [&] {
      return std::any_of(sent.begin(), sent.end(), [=](const Sent &entry) {
        return type(entry.body) == id;
      });
    }));
  }
  void ids(std::initializer_list<uint16_t> expected) {
    const auto snapshot = sentSnapshot();
    assert(snapshot.size() == expected.size());
    size_t i = 0;
    for (auto id : expected) assert(type(snapshot[i++].body) == id);
  }
};

static void preservesDescriptorAndBindingCodes() {
  tag::aas::InputChannel descriptor;
  for (int code : mazdaCodes) descriptor.add_available_buttons(code);
  descriptor.mutable_screen_config()->set_width(800);
  descriptor.mutable_screen_config()->set_height(480);
  tag::aas::InputChannel parsed;
  assert(parsed.ParseFromString(descriptor.SerializeAsString()));
  const std::vector<int> decoded(parsed.available_buttons().begin(),
                                  parsed.available_buttons().end());
  assert(decoded == mazdaCodes);
  assert(parsed.screen_config().width() == 800);
  assert(parsed.screen_config().height() == 480);
  // Explicit unpacked field1 values also preserve unknown legacy enum codes.
  assert(parsed.ParseFromString(std::string("\x08\x81\x80\x04\x08\x82\x80\x04", 8)));
  assert(parsed.available_buttons_size() == 2);
  assert(parsed.available_buttons(0) == 65537);
  assert(parsed.available_buttons(1) == 65538);

  Fixture fixture;
  fixture.registration();
  fixture.ids({7, 0x8002});
  const auto requests = fixture.sentSnapshot();
  assert(requests[0].channel == 2 && requests[0].flags == 0x0f);
  assert(requests[1].channel == 2 && requests[1].flags == 0x0b);
  tag::aas::ChannelOpenRequest open;
  assert(open.ParseFromArray(requests[0].body.data() + 2,
                              int(requests[0].body.size() - 2)));
  assert(open.unknown_field() == 0 && open.channel_id() == 2);
  tag::aas::InputBindingRequest binding;
  assert(binding.ParseFromArray(requests[1].body.data() + 2,
                                 int(requests[1].body.size() - 2)));
  assert(std::vector<int>(binding.keycodes().begin(), binding.keycodes().end()) == mazdaCodes);
  assert(requests[1].body[2] == 0x0a); // Actual packed repeated int32 wire.
  const auto responses = fixture.clientSnapshot();
  assert(responses.size() == 1 && responses[0].body == bound);
  assert(responses[0].client == 9 && responses[0].channel == 2 && !responses[0].specific);
  fixture.registration();
  fixture.receive(bound);
  fixture.ids({7, 0x8002});
  assert(fixture.clientSnapshot().size() == 1); // Neither reopen nor duplicate ACK.
  fixture.receive(event);
  assert(fixture.clientSnapshot().back().body == event);
}

static void strictOpenFailures() {
  for (const auto &response : std::vector<Bytes>{
        {0, 8, 8, 1}, {0, 8}, {0, 8, 8, 0x80}, {0, 8, 8, 2}}) {
    Fixture fixture;
    fixture.openResponse = response;
    fixture.registration();
    fixture.registration(10);
    fixture.receive(opened);
    fixture.receive(bound);
    fixture.receive(event);
    fixture.ids({7});
    assert(fixture.clientSnapshot().empty()); // No fake binding ACK.
  }
}

static void strictBindingFailuresAndCachedActualResponse() {
  for (const auto &response : std::vector<Bytes>{
        {0x80, 3, 8, 1}, {0x80, 3}, {0x80, 3, 8, 0x80}, {0x80, 3, 8, 2}}) {
    Fixture fixture;
    fixture.bindingResponse = response;
    fixture.registration();
    fixture.registration();
    fixture.registration(10);
    fixture.receive(bound); // Contradictory later success cannot revive failure.
    fixture.receive(event);
    fixture.ids({7, 0x8002});
    const auto replies = fixture.clientSnapshot();
    assert(replies.size() == 2);
    assert(replies[0].client == 9 && replies[1].client == 10);
    assert(replies[0].body == response && replies[1].body == response);
  }
}

static void timeoutIsBoundedTerminalAndSilent() {
  for (bool openTimeout : {true, false}) {
    Fixture fixture(25);
    fixture.answerOpen = !openTimeout;
    fixture.answerBinding = false;
    const auto start = std::chrono::steady_clock::now();
    fixture.registration();
    const auto duration = std::chrono::steady_clock::now() - start;
    assert(duration >= std::chrono::milliseconds(20));
    assert(duration < std::chrono::seconds(1));
    fixture.receive(opened);
    fixture.receive(bound);
    fixture.receive(event);
    const auto retryStart = std::chrono::steady_clock::now();
    for (int i = 0; i < 100; ++i) fixture.registration();
    assert(std::chrono::steady_clock::now() - retryStart < std::chrono::seconds(1));
    if (openTimeout) fixture.ids({7});
    else fixture.ids({7, 0x8002});
    assert(fixture.clientSnapshot().empty());
  }
}

static void receiveNeverWaitsAndConcurrentClientsInitializeOnce() {
  Fixture fixture(500);
  fixture.answerOpen = fixture.answerBinding = false;
  auto first = std::async(std::launch::async, [&] { fixture.registration(9); });
  fixture.waitSent(7);
  assert(first.wait_for(std::chrono::milliseconds(10)) == std::future_status::timeout);
  assert(!fixture.receive({}));
  assert(!fixture.receive({0x80}));
  assert(!fixture.receive({0x80, 4}));
  fixture.receive(bound); // Unsolicited binding cannot skip ChannelOpen.
  fixture.receive(event); // Events before successful binding are held.
  assert(fixture.clientSnapshot().empty());
  auto openRx = std::async(std::launch::async, [&] { fixture.receive(opened); });
  assert(openRx.wait_for(std::chrono::seconds(1)) == std::future_status::ready);
  openRx.get();
  fixture.waitSent(0x8002);
  auto second = std::async(std::launch::async, [&] { fixture.registration(10); });
  auto bindingRx = std::async(std::launch::async, [&] { fixture.receive(bound); });
  assert(bindingRx.wait_for(std::chrono::seconds(1)) == std::future_status::ready);
  bindingRx.get();
  first.get();
  second.get();
  fixture.ids({7, 0x8002});
  auto replies = fixture.clientSnapshot();
  assert(replies.size() == 2);
  assert(replies[0].body == bound && replies[1].body == bound);
  std::set<int> recipients{replies[0].client, replies[1].client};
  assert(recipients == std::set<int>({9, 10}));
  fixture.receive(event);
  assert(fixture.clientSnapshot().size() == 4);
  fixture.handler.disconnected(9);
  fixture.receive(event);
  replies = fixture.clientSnapshot();
  assert(replies.size() == 5 && replies.back().client == 10);
  fixture.registration(9); // New Unix client receives cached actual binding.
  assert(fixture.clientSnapshot().size() == 6);
  fixture.ids({7, 0x8002});
}

static void callbacksCanDisconnectAndFreshSessionsReset() {
  Fixture fixture;
  fixture.observeClient = [&](int client, const Bytes &) { fixture.handler.disconnected(client); };
  fixture.registration(); // Binding callback can take the state mutex itself.
  fixture.receive(event);
  assert(fixture.clientSnapshot().size() == 1);
  assert(!fixture.handler.handleMessageFromClient(9, 0, false, {}));
  fixture.ids({7, 0x8002});
  Fixture fresh;
  fresh.registration();
  fresh.ids({7, 0x8002});
  assert(fresh.clientSnapshot().size() == 1);
}

int main() {
  preservesDescriptorAndBindingCodes();
  strictOpenFailures();
  strictBindingFailuresAndCachedActualResponse();
  timeoutIsBoundedTerminalAndSilent();
  receiveNeverWaitsAndConcurrentClientsInitializeOnce();
  callbacksCanDisconnectAndFreshSessionsReset();
  std::cout << "Actual input-handler handshake tests passed" << std::endl;
}
