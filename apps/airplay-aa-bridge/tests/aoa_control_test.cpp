// Exercise the production AOA control transaction handler with a scripted ep0.
// The mock models individual control completions, never a real USB endpoint.
#include "AoaControl.h"
#include <algorithm>
#include <cassert>
#include <cerrno>
#include <chrono>
#include <csignal>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>
#include <unistd.h>

using airplay_aa::AoaAction;
using airplay_aa::AoaSetup;
using airplay_aa::classifyAoaSetup;
using airplay_aa::handleAoaSetup;
using airplay_aa::invokeAoaTransfer;
using namespace std::chrono_literals;

namespace {
struct Operation {
  bool deviceToHost;
  size_t length;
  ssize_t result;
  int error = 0;
  std::vector<unsigned char> bytes;
};

struct MockEp0 {
  std::vector<Operation> expected;
  size_t calls = 0;

  ssize_t transfer(bool deviceToHost, void *buffer, size_t length) {
    assert(calls < expected.size());
    const auto &operation = expected[calls++];
    assert(deviceToHost == operation.deviceToHost);
    assert(length == operation.length);
    if (!operation.bytes.empty()) {
      assert(buffer != nullptr);
      assert(operation.bytes.size() <= length);
      if (deviceToHost)
        assert(std::memcmp(buffer, operation.bytes.data(), operation.bytes.size()) == 0);
      else
        std::memcpy(buffer, operation.bytes.data(), operation.bytes.size());
    }
    errno = operation.error;
    return operation.result;
  }

  bool handle(const AoaSetup &setup) {
    return handleAoaSetup(setup, [this](bool in, void *data, size_t count) {
      return transfer(in, data, count);
    });
  }

  void complete() const { assert(calls == expected.size()); }
};

template <class Action> bool throws(Action action) {
  try { action(); } catch (const std::exception &) { return true; }
  return false;
}

AoaSetup protocol() { return {0xc0, 51, 0, 0, 2}; }
AoaSetup identity(uint16_t index, uint16_t length) {
  return {0x40, 52, 0, index, length};
}
AoaSetup start() { return {0x40, 53, 0, 0, 0}; }

void requireRejected(const AoaSetup &setup) {
  assert(classifyAoaSetup(setup) == AoaAction::Reject);
  // FunctionFS stalls pending IN by read and pending OUT by write. Even an
  // unrelated OUT with wLength=0 must perform this opposite-direction stall.
  MockEp0 endpoint{{{(setup.requestType & 0x80) == 0, 0, -1, airplay_aa::AoaStallError, {}}}};
  assert(!endpoint.handle(setup));
  endpoint.complete();
}

void testValidSequence() {
  MockEp0 endpoint{{{true, 2, 2, 0, {2, 0}},
                    {false, 4, 4, 0, {'T', 'A', 'G', 0}},
                    {false, 0, 0, 0, {}}}};
  assert(classifyAoaSetup(protocol()) == AoaAction::Protocol);
  assert(!endpoint.handle(protocol()));
  assert(classifyAoaSetup(identity(0, 4)) == AoaAction::Identification);
  assert(!endpoint.handle(identity(0, 4)));
  assert(classifyAoaSetup(start()) == AoaAction::Start);
  assert(endpoint.handle(start()));
  endpoint.complete();
}

void testExactSetupMatching() {
  // Only vendor, device-recipient, correct-direction requests are AOA.
  for (unsigned int type = 0; type <= 255; ++type) {
    for (unsigned int request = 51; request <= 53; ++request) {
      AoaSetup setup = request == 51 ? protocol() : request == 52 ? identity(0, 1) : start();
      const auto validType = setup.requestType;
      setup.requestType = static_cast<uint8_t>(type);
      if (type != validType)
        requireRejected(setup);
    }
  }
  for (auto setup : {protocol(), identity(0, 1), start()}) {
    setup.value = 1;
    requireRejected(setup);
  }
  for (auto setup : {protocol(), start()}) {
    setup.index = 1;
    requireRejected(setup);
  }
  for (uint16_t length : {uint16_t(0), uint16_t(1), uint16_t(3), uint16_t(65535)}) {
    auto setup = protocol(); setup.length = length; requireRejected(setup);
  }
  for (uint16_t length : {uint16_t(1), uint16_t(2), uint16_t(65535)}) {
    auto setup = start(); setup.length = length; requireRejected(setup);
  }
  requireRejected(identity(6, 1));
  requireRejected(identity(65535, 1));
  requireRejected(identity(0, 0));
  requireRejected(identity(0, 257));
  requireRejected(identity(0, 65535));
  // The previous production loop accidentally treated any zero-byte ep0
  // completion as a reason to leave initial mode. Exhaust all other requests.
  for (unsigned int request = 0; request <= 255; ++request) {
    if (request == 53) continue;
    requireRejected({0x40, static_cast<uint8_t>(request), 0, 0, 0});
  }
}

void testIdentificationPayloads() {
  for (uint16_t index = 0; index < 6; ++index) {
    MockEp0 endpoint{{{false, 1, 1, 0, {0}}}};
    assert(!endpoint.handle(identity(index, 1)));
    endpoint.complete();
  }
  // Both the longest permitted string and genuine UTF-8 remain accepted.
  std::vector<unsigned char> maximum(256, 'x'); maximum.back() = 0;
  MockEp0 maximumEndpoint{{{false, 256, 256, 0, maximum}}};
  assert(!maximumEndpoint.handle(identity(5, 256)));
  maximumEndpoint.complete();
  MockEp0 unicode{{{false, 8, 8, 0, {'A', 0xc2, 0xa3, 0xf0, 0x9f, 0x98, 0x80, 0}}}};
  assert(!unicode.handle(identity(1, 8)));
  unicode.complete();

  for (const auto &bytes : std::vector<std::vector<unsigned char>>{
           {'x'}, {'x', 'y'}, {0xc0, 0x80, 0}, {0xe0, 0x80, 0x80, 0},
           {0xed, 0xa0, 0x80, 0}, {0xf4, 0x90, 0x80, 0x80, 0},
           {0x80, 0}, {0xe2, 0x82, 0}}) {
    MockEp0 endpoint{{{false, bytes.size(), static_cast<ssize_t>(bytes.size()), 0, bytes}}};
    assert(throws([&] { endpoint.handle(identity(0, static_cast<uint16_t>(bytes.size()))); }));
    endpoint.complete();
  }
  // Short transfers and EOF cannot be mistaken for a valid identification.
  for (ssize_t count : {ssize_t(0), ssize_t(1), ssize_t(3)}) {
    MockEp0 endpoint{{{false, 4, count, 0, {}}}};
    assert(throws([&] { endpoint.handle(identity(0, 4)); }));
    endpoint.complete();
  }
}

void testFailedCompletionNeverSwitches() {
  // No retry of a canceled transaction: after EINTR/EIDRM FunctionFS can be
  // back in event mode, so another read might consume the next setup event.
  for (int error : {EINTR, EIDRM, ESHUTDOWN, EIO}) {
    MockEp0 endpoint{{{false, 0, -1, error, {}}}};
    bool switched = false;
    try { switched = endpoint.handle(start()); } catch (const std::exception &) {}
    assert(!switched);
    endpoint.complete();
  }
  // A nonzero result on a zero-length request is also invalid.
  MockEp0 impossible{{{false, 0, 1, 0, {}}}};
  assert(throws([&] { impossible.handle(start()); }));
  impossible.complete();
  for (ssize_t count : {ssize_t(0), ssize_t(1), ssize_t(3)}) {
    MockEp0 endpoint{{{true, 2, count, 0, {2, 0}}}};
    assert(throws([&] { endpoint.handle(protocol()); }));
    endpoint.complete();
  }
  for (int error : {EINTR, ESHUTDOWN, EIO}) {
    MockEp0 endpoint{{{true, 2, -1, error, {2, 0}}}};
    assert(throws([&] { endpoint.handle(protocol()); }));
    endpoint.complete();
  }
  // Unsupported requests never authorize a switch, even if a broken ep0
  // unexpectedly reports a successful wrong-direction zero-length operation.
  MockEp0 invalidStall{{{true, 0, 0, 0, {}}}};
  assert(throws([&] { invalidStall.handle({0x40, 99, 0, 0, 0}); }));
  invalidStall.complete();
  MockEp0 canceledStall{{{true, 0, -1, EIDRM, {}}}};
  assert(!canceledStall.handle({0x40, 99, 0, 0, 0}));
  canceledStall.complete();
}

uint32_t little32(const std::vector<uint8_t> &bytes, size_t offset) {
  assert(offset + 4 <= bytes.size());
  return uint32_t(bytes[offset]) | (uint32_t(bytes[offset + 1]) << 8) |
         (uint32_t(bytes[offset + 2]) << 16) | (uint32_t(bytes[offset + 3]) << 24);
}

void testProductionDescriptorBytes() {
  const auto descriptors = airplay_aa::initialAoaDescriptors();
  assert(descriptors.size() == 38);
  assert(little32(descriptors, 0) == 3); // Linux FunctionFS v2.
  assert(little32(descriptors, 4) == descriptors.size());
  const auto flags = little32(descriptors, 8);
  assert(flags == (1 | 2 | 64 | 128)); // FS, HS, ALL_CTRL_RECIP, CONFIG0_SETUP.
  assert(little32(descriptors, 12) == 1);
  assert(little32(descriptors, 16) == 1);
  for (size_t offset : {size_t(20), size_t(29)}) {
    const std::vector<uint8_t> expected{9, 4, 0, 0, 0, 0xff, 0xff, 0, 1};
    assert(std::equal(expected.begin(), expected.end(), descriptors.begin() + offset));
  }
  // A single zero-endpoint vendor interface at each speed: no CD-ROM or bulk
  // endpoints exist in initial mode. The strings block completes FFS_ACTIVE.
  const auto strings = airplay_aa::initialAoaStrings();
  assert(little32(strings, 0) == 2);
  assert(little32(strings, 4) == strings.size());
  assert(little32(strings, 8) == 1 && little32(strings, 12) == 1);
  assert(strings[16] == 0x09 && strings[17] == 0x04);
  const std::string expected = "Android Accessory Interface";
  assert(strings.size() == 18 + expected.size() + 1);
  assert(std::memcmp(strings.data() + 18, expected.data(), expected.size()) == 0);
  assert(strings.back() == 0);
}

void testDeadlineWrapper() {
  struct sigaction previous {}, installed {};
  assert(sigaction(SIGUSR1, nullptr, &previous) == 0);
  installUsbInterruptHandler();
  assert(sigaction(SIGUSR1, nullptr, &installed) == 0);
  assert((installed.sa_flags & SA_RESTART) == 0);

  // The real production wrapper interrupts an actual blocking syscall. There
  // is no USB device here; keeping the writer open prevents ordinary pipe EOF.
  int pipefd[2];
  assert(pipe(pipefd) == 0);
  int calls = 0;
  const auto began = std::chrono::steady_clock::now();
  assert(throws([&] {
    invokeAoaTransfer([&] {
      ++calls;
      char byte;
      return read(pipefd[0], &byte, 1);
    }, 80ms);
  }));
  const auto elapsed = std::chrono::steady_clock::now() - began;
  assert(calls == 1); // EINTR never replays a canceled control transaction.
  assert(elapsed >= 70ms && elapsed < 500ms);
  close(pipefd[0]); close(pipefd[1]);

  // EAGAIN before queuing backs off, preserving the same absolute deadline.
  calls = 0;
  assert(invokeAoaTransfer([&]() -> ssize_t {
    if (++calls < 3) { errno = EAGAIN; return -1; }
    return 2;
  }, 200ms) == 2);
  assert(calls == 3);
  calls = 0;
  const auto retryBegan = std::chrono::steady_clock::now();
  assert(throws([&] {
    invokeAoaTransfer([&]() -> ssize_t { ++calls; errno = EAGAIN; return -1; }, 65ms);
  }));
  assert(calls >= 2 && calls <= 9);
  assert(std::chrono::steady_clock::now() - retryBegan < 500ms);

  for (int error : {EINTR, EIDRM, ESHUTDOWN, EIO}) {
    calls = 0;
    const auto result = invokeAoaTransfer([&]() -> ssize_t {
      ++calls; errno = error; return -1;
    }, 200ms);
    assert(result == -1 && errno == error && calls == 1);
  }
  // The watchdog is joined on normal return and on a callback exception.
  // Restoring the caller's signal disposition is safe only after that join.
  assert(throws([&] {
    invokeAoaTransfer([]() -> ssize_t { throw std::runtime_error("scripted failure"); }, 200ms);
  }));
  assert(sigaction(SIGUSR1, &previous, nullptr) == 0);
}
} // namespace

int main() {
  testValidSequence();
  testExactSetupMatching();
  testIdentificationPayloads();
  testFailedCompletionNeverSwitches();
  testProductionDescriptorBytes();
  testDeadlineWrapper();
  std::cout << "AOA production control transaction tests passed" << std::endl;
}
