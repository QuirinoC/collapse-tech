// Distributed under GPLv3 only as specified in repository's root LICENSE file
#pragma once

#include "UsbEndpointState.h"
#include <array>
#include <cerrno>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <pthread.h>
#include <stdexcept>
#include <system_error>
#include <thread>
#include <vector>

namespace airplay_aa {

// Linux FunctionFS ABI constants are kept portable for offline serialization
// tests; ModeSwitcher checks them against the platform's Linux UAPI header.
constexpr uint32_t InitialAoaFlags = 1 | 2 | 64 | 128;
#ifdef EL2HLT
constexpr int AoaStallError = EL2HLT;
#else
constexpr int AoaStallError = 51; // Linux EL2HLT; host-only tests perform no USB I/O.
#endif

inline void appendAoa32(std::vector<uint8_t> &data, uint32_t value) {
  for (unsigned shift = 0; shift < 32; shift += 8)
    data.push_back(static_cast<uint8_t>(value >> shift));
}

inline std::vector<uint8_t> initialAoaDescriptors() {
  const uint8_t interface[] = {9, 4, 0, 0, 0, 0xff, 0xff, 0, 1};
  std::vector<uint8_t> data;
  appendAoa32(data, 3); // FUNCTIONFS_DESCRIPTORS_MAGIC_V2
  appendAoa32(data, 12 + 4 + 4 + 2 * sizeof interface);
  appendAoa32(data, InitialAoaFlags);
  appendAoa32(data, 1); // full-speed descriptor count
  appendAoa32(data, 1); // high-speed descriptor count
  data.insert(data.end(), std::begin(interface), std::end(interface));
  data.insert(data.end(), std::begin(interface), std::end(interface));
  return data;
}

inline std::vector<uint8_t> initialAoaStrings() {
  const char text[] = "Android Accessory Interface";
  std::vector<uint8_t> data;
  appendAoa32(data, 2); // FUNCTIONFS_STRINGS_MAGIC
  appendAoa32(data, 16 + 2 + sizeof text);
  appendAoa32(data, 1);
  appendAoa32(data, 1);
  data.push_back(0x09);
  data.push_back(0x04); // en-US
  data.insert(data.end(), text, text + sizeof text);
  return data;
}

// Host-order fields, independent of Linux's packed little-endian setup struct.
struct AoaSetup {
  uint8_t requestType;
  uint8_t request;
  uint16_t value;
  uint16_t index;
  uint16_t length;
};

enum class AoaAction { Protocol, Identification, Start, Reject };

inline AoaAction classifyAoaSetup(const AoaSetup &setup) {
  if (setup.requestType == 0xc0 && setup.request == 51 &&
      setup.value == 0 && setup.index == 0 && setup.length == 2)
    return AoaAction::Protocol;
  if (setup.requestType == 0x40 && setup.request == 52 &&
      setup.value == 0 && setup.index <= 5 &&
      setup.length >= 1 && setup.length <= 256)
    return AoaAction::Identification;
  if (setup.requestType == 0x40 && setup.request == 53 &&
      setup.value == 0 && setup.index == 0 && setup.length == 0)
    return AoaAction::Start;
  return AoaAction::Reject;
}

inline bool validAoaString(const uint8_t *data, size_t length) {
  if (length == 0 || data[length - 1] != 0)
    return false;
  // Validate UTF-8, including overlong forms, surrogates and values > U+10FFFF.
  for (size_t offset = 0; offset + 1 < length;) {
    const uint8_t first = data[offset++];
    if (first == 0)
      return false;
    if (first < 0x80)
      continue;
    size_t continuation;
    uint32_t codepoint;
    uint32_t minimum;
    if (first >= 0xc2 && first <= 0xdf) {
      continuation = 1;
      codepoint = first & 0x1f;
      minimum = 0x80;
    } else if (first >= 0xe0 && first <= 0xef) {
      continuation = 2;
      codepoint = first & 0x0f;
      minimum = 0x800;
    } else if (first >= 0xf0 && first <= 0xf4) {
      continuation = 3;
      codepoint = first & 0x07;
      minimum = 0x10000;
    } else {
      return false;
    }
    if (continuation > length - 1 - offset)
      return false;
    while (continuation--) {
      const uint8_t next = data[offset++];
      if ((next & 0xc0) != 0x80)
        return false;
      codepoint = (codepoint << 6) | (next & 0x3f);
    }
    if (codepoint < minimum || codepoint > 0x10ffff ||
        (codepoint >= 0xd800 && codepoint <= 0xdfff))
      return false;
  }
  return true;
}

// FunctionFS control data/status I/O can block even with O_NONBLOCK. Interrupt
// the calling thread after one absolute deadline; repeat until completion so a
// signal delivered immediately before the syscall cannot leave it blocked.
class AoaTransferDeadline {
public:
  using Clock = std::chrono::steady_clock;

  explicit AoaTransferDeadline(Clock::duration timeout)
      : deadline(Clock::now() + timeout), target(pthread_self()),
        watcher([this] { watch(); }) {}

  AoaTransferDeadline(const AoaTransferDeadline &) = delete;
  AoaTransferDeadline &operator=(const AoaTransferDeadline &) = delete;

  ~AoaTransferDeadline() { finish(); }

  void finish() {
    {
      std::lock_guard<std::mutex> lock(mutex);
      finished = true;
    }
    changed.notify_all();
    if (watcher.joinable())
      watcher.join();
  }

  void check() const {
    std::lock_guard<std::mutex> lock(mutex);
    if (expired || Clock::now() >= deadline)
      throw std::runtime_error("AOA control transfer deadline expired");
    if (signalError)
      throw std::system_error(signalError, std::generic_category(),
                              "interrupt AOA control transfer");
  }

private:
  void watch() {
    std::unique_lock<std::mutex> lock(mutex);
    if (changed.wait_until(lock, deadline, [this] { return finished; }))
      return;
    expired = true;
    while (!finished) {
      signalError = pthread_kill(target, SIGUSR1);
      changed.wait_for(lock, std::chrono::milliseconds(10),
                       [this] { return finished; });
    }
  }

  const Clock::time_point deadline;
  const pthread_t target;
  mutable std::mutex mutex;
  std::condition_variable changed;
  bool finished = false;
  bool expired = false;
  int signalError = 0;
  std::thread watcher;
};

// One syscall is one control transfer: a short result or EINTR must not be
// replayed as a second transaction. EAGAIN before queuing may be retried within
// the same deadline, with a small pause to avoid a ready-fd busy loop.
template <class Operation>
ssize_t invokeAoaTransfer(Operation operation,
                         AoaTransferDeadline::Clock::duration timeout =
                             std::chrono::seconds(2)) {
  AoaTransferDeadline guard(timeout);
  for (;;) {
    guard.check();
    errno = 0;
    const ssize_t result = operation();
    const int error = errno;
    guard.check();
    if (result >= 0 || (error != EAGAIN && error != EWOULDBLOCK)) {
      guard.finish();
      errno = error;
      return result;
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
}

// Transfer(true) writes an IN response; Transfer(false) reads an OUT stage.
// Opposite-direction I/O is FunctionFS's explicit stall operation. Only a
// successful empty OUT stage for exact request 53 authorizes re-enumeration.
template <class Transfer>
bool handleAoaSetup(const AoaSetup &setup, Transfer transfer) {
  const AoaAction action = classifyAoaSetup(setup);
  if (action == AoaAction::Reject) {
    errno = 0;
    const ssize_t result = transfer((setup.requestType & 0x80) == 0, nullptr, 0);
    const int error = errno;
    if (result < 0 && (error == AoaStallError || error == EIDRM))
      return false;
    if (result < 0)
      throw std::system_error(error, std::generic_category(), "stall AOA control");
    throw std::runtime_error("invalid AOA control did not complete a stall");
  }

  std::array<uint8_t, 256> data{};
  const bool input = action == AoaAction::Protocol;
  if (input) {
    data[0] = 2;
    data[1] = 0;
  }
  errno = 0;
  const ssize_t result = transfer(input, data.data(), setup.length);
  const int error = errno;
  if (result < 0)
    throw std::system_error(error, std::generic_category(), "AOA control transfer");
  if (result != setup.length)
    throw std::runtime_error("short or oversized AOA control transfer");
  if (action == AoaAction::Identification &&
      !validAoaString(data.data(), setup.length))
    throw std::runtime_error("AOA identifying string is not NUL-terminated UTF-8");
  return action == AoaAction::Start;
}

} // namespace airplay_aa
