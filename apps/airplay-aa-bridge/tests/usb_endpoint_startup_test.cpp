// Focused tests of the state gate and pending-byte pump used by AaCommunicator.
#include "UsbEndpointState.h"
#include <cassert>
#include <csignal>
#include <future>
#include <iostream>
#include <string>
#include <thread>
#include <vector>
#include <unistd.h>

using namespace std::chrono_literals;

template <class Action> bool throws(Action action) {
  try { action(); } catch (const std::exception &) { return true; }
  return false;
}

int main() {
  // Endpoint operations cannot run before ep0 reports ENABLE.
  {
    UsbEndpointState state(500ms);
    auto waiting = std::async(std::launch::async, [&] { return state.waitEnabled(); });
    assert(waiting.wait_for(20ms) == std::future_status::timeout);
    state.enable();
    assert(waiting.get() == 1);
  }
  // ESHUTDOWN cannot reuse a stale enabled flag; it needs a later ENABLE.
  {
    UsbEndpointState state(500ms);
    state.enable();
    auto generation = state.waitEnabled();
    auto waiting = std::async(std::launch::async, [&] { state.recoverStartup(generation); });
    assert(waiting.wait_for(20ms) == std::future_status::timeout);
    state.disable();
    state.enable();
    waiting.get();
    assert(state.waitEnabled() == 2);
  }
  // A newer ENABLE already observed before an error handler is sufficient.
  {
    UsbEndpointState state(500ms);
    state.enable();
    auto generation = state.waitEnabled();
    state.disable(); state.enable();
    state.recoverStartup(generation);
    state.bytesReceived();
    assert(throws([&] { state.recoverStartup(2); }));
    assert(state.disable());
    assert(throws([&] { state.waitEnabled(); }));
  }
  // A reader crossing first session bytes also cancels a writer already waiting
  // for startup recovery; a later ENABLE cannot authorize a replay.
  {
    UsbEndpointState state(500ms);
    state.enable();
    auto generation = state.waitEnabled();
    auto waiting = std::async(std::launch::async, [&] {
      return throws([&] { state.recoverStartup(generation); });
    });
    assert(waiting.wait_for(20ms) == std::future_status::timeout);
    state.bytesReceived();
    state.enable();
    assert(waiting.get());
  }
  // All startup retries share one deadline. ENABLE does not extend it.
  {
    UsbEndpointState state(90ms);
    state.enable();
    auto started = UsbEndpointState::Clock::now();
    for (int index = 0; index < 3; ++index) {
      auto generation = state.waitEnabled();
      auto waiting = std::async(std::launch::async, [&] { state.recoverStartup(generation); });
      std::this_thread::sleep_for(20ms);
      state.enable();
      waiting.get();
    }
    assert(throws([&] { state.recoverStartup(state.waitEnabled()); }));
    auto elapsed = UsbEndpointState::Clock::now() - started;
    assert(elapsed >= 80ms && elapsed < 300ms);
  }
  // Both teardown and UNBIND promptly wake a thread awaiting enable/re-enable.
  for (bool unbind : {false, true}) {
    UsbEndpointState state(2s);
    auto waiting = std::async(std::launch::async, [&] { return throws([&] { state.waitEnabled(); }); });
    assert(waiting.wait_for(20ms) == std::future_status::timeout);
    if (unbind) state.unbind(); else state.stop();
    assert(waiting.wait_for(100ms) == std::future_status::ready);
    assert(waiting.get());
  }
  // ep0's deadline poll stays independent of a bulk worker blocked in a
  // synchronous syscall. Exercise its normal SIGUSR1 teardown mechanism on an
  // actual blocking pipe read (not a fabricated successful USB session).
  {
    struct sigaction installed {}, previous {};
    assert(sigaction(SIGUSR1, nullptr, &previous) == 0);
    installUsbInterruptHandler();
    assert(sigaction(SIGUSR1, nullptr, &installed) == 0);
    assert((installed.sa_flags & SA_RESTART) == 0);
    int descriptors[2];
    assert(pipe(descriptors) == 0);
    UsbEndpointState state(90ms);
    state.enable();
    std::promise<bool> completion;
    auto done = completion.get_future();
    std::thread blocked([&] {
      char byte;
      auto result = read(descriptors[0], &byte, 1);
      completion.set_value(result == -1 && errno == EINTR);
    });
    assert(done.wait_for(20ms) == std::future_status::timeout);
    auto started = UsbEndpointState::Clock::now();
    while (!throws([&] { state.checkStartupDeadline(); }))
      std::this_thread::sleep_for(10ms);
    state.stop();
    assert(pthread_kill(blocked.native_handle(), SIGUSR1) == 0);
    assert(done.wait_for(200ms) == std::future_status::ready);
    assert(done.get());
    blocked.join();
    assert(UsbEndpointState::Clock::now() - started < 300ms);
    close(descriptors[0]); close(descriptors[1]);
    assert(sigaction(SIGUSR1, &previous, nullptr) == 0);
  }
  // The actual write loop preserves offsets on EINTR, EAGAIN and ESHUTDOWN.
  {
    UsbEndpointState state(500ms);
    state.enable();
    std::string expected = "abcdefgh", received;
    std::vector<std::string> requested;
    int operation = 0, pauses = 0, recoveries = 0;
    pumpPendingBytes(expected.data(), expected.size(),
      [&](const void *data, size_t length) -> ssize_t {
        requested.emplace_back(static_cast<const char *>(data), length);
        ++operation;
        if (operation == 1) { received.append(static_cast<const char *>(data), 2); return 2; }
        if (operation == 2) { errno = EINTR; return -1; }
        if (operation == 3) { errno = EAGAIN; return -1; }
        if (operation == 4) { errno = ESHUTDOWN; return -1; }
        received.append(static_cast<const char *>(data), length); return length;
      }, [&] { return state.waitEnabled(); },
      [&](auto generation) { ++recoveries; state.disable(); state.enable(); state.recoverStartup(generation); },
      [&] { ++pauses; state.pauseTransient(); }, [] { return false; });
    assert(received == expected && operation == 5 && pauses == 1 && recoveries == 1);
    for (size_t index = 1; index < requested.size(); ++index)
      assert(requested[index] == "cdefgh");
  }
  // Zero progress and established-session shutdown fail instead of corrupting
  // offsets or replaying the pending frame.
  {
    auto before = [] { return UsbEndpointState::Generation(1); };
    assert(throws([&] {
      pumpPendingBytes("abc", 3, [](const void *, size_t) { return 0; }, before,
        [](auto) {}, [] {}, [] { return false; });
    }));
    UsbEndpointState state(500ms); state.enable(); state.bytesReceived();
    int calls = 0;
    assert(throws([&] {
      pumpPendingBytes("abc", 3, [&](const void *, size_t) { ++calls; errno = ESHUTDOWN; return -1; },
        [&] { return state.waitEnabled(); }, [&](auto generation) { state.recoverStartup(generation); },
        [&] { state.pauseTransient(); }, [] { return false; });
    }));
    assert(calls == 1);
  }
  std::cout << "USB endpoint startup and pending-byte tests passed\n";
}
