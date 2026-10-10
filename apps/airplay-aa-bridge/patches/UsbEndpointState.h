// Distributed under GPLv3 only as specified in repository's root LICENSE file
#pragma once

#include <cerrno>
#include <chrono>
#include <csignal>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <stdexcept>
#include <system_error>
#include <sys/types.h>

// signal() on glibc can install SA_RESTART, which would restart FunctionFS's
// interruptible completion wait during teardown. Install this before workers
// start so SIGUSR1 reliably releases a blocked read/write with EINTR.
inline void installUsbInterruptHandler() {
  struct sigaction action {};
  action.sa_handler = [](int) {};
  sigemptyset(&action.sa_mask);
  action.sa_flags = 0;
  if (sigaction(SIGUSR1, &action, nullptr) != 0)
    throw std::system_error(errno, std::generic_category(), "install USB interrupt handler");
}

// FunctionFS can expose ep1/ep2 before the host's SET_CONFIGURATION enables
// them. Retry only that startup window; never replay an established session.
class UsbEndpointState {
public:
  using Clock = std::chrono::steady_clock;
  using Generation = uint64_t;

  explicit UsbEndpointState(Clock::duration timeout = std::chrono::seconds(10))
      : startupTimeout(timeout), deadline(Clock::now() + timeout) {}

  void beginStartup() {
    std::lock_guard<std::mutex> lock(mutex);
    deadline = Clock::now() + startupTimeout;
  }

  void enable() {
    {
      std::lock_guard<std::mutex> lock(mutex);
      enabled = true;
      ++generation;
    }
    changed.notify_all();
  }

  bool disable() {
    bool established;
    {
      std::lock_guard<std::mutex> lock(mutex);
      enabled = false;
      established = sessionStarted;
    }
    changed.notify_all();
    return established;
  }

  void unbind() {
    {
      std::lock_guard<std::mutex> lock(mutex);
      enabled = false;
      unbound = true;
    }
    changed.notify_all();
  }

  void stop() {
    {
      std::lock_guard<std::mutex> lock(mutex);
      stopping = true;
    }
    changed.notify_all();
  }

  // Record the first positive bulk OUT read before parsing any of its bytes.
  void bytesReceived() {
    {
      std::lock_guard<std::mutex> lock(mutex);
      sessionStarted = true;
    }
    changed.notify_all();
  }

  Generation waitEnabled() {
    std::unique_lock<std::mutex> lock(mutex);
    for (;;) {
      checkState();
      if (enabled)
        return generation;
      changed.wait_until(lock, deadline);
    }
  }

  // ep0's independent 100ms poll checks the deadline even if a synchronous
  // FunctionFS bulk transfer is already waiting for host completion.
  void checkStartupDeadline() {
    std::lock_guard<std::mutex> lock(mutex);
    checkState();
  }

  void recoverStartup(Generation failedGeneration) {
    std::unique_lock<std::mutex> lock(mutex);
    if (sessionStarted)
      throw std::runtime_error("USB ESHUTDOWN after session bytes; disconnect is fatal");
    // DISABLE may not have reached ep0's consumer yet. An old enabled=true is
    // insufficient: only a newer actual ENABLE can authorize another syscall.
    if (generation == failedGeneration)
      enabled = false;
    for (;;) {
      if (sessionStarted)
        throw std::runtime_error("USB ESHUTDOWN recovery crossed first session bytes; disconnect is fatal");
      checkState();
      if (enabled && generation > failedGeneration)
        return;
      changed.wait_until(lock, deadline);
    }
  }

  void pauseTransient() {
    std::unique_lock<std::mutex> lock(mutex);
    checkState();
    changed.wait_for(lock, std::chrono::milliseconds(10));
    checkState();
  }

private:
  void checkState() const {
    if (stopping)
      throw std::runtime_error("USB transport stopping");
    if (unbound)
      throw std::runtime_error("USB FunctionFS unbound");
    if (sessionStarted && !enabled)
      throw std::runtime_error("USB FunctionFS disabled after session bytes");
    if (!sessionStarted && Clock::now() >= deadline)
      throw std::runtime_error("USB startup deadline expired before session bytes");
  }

  std::mutex mutex;
  std::condition_variable changed;
  Clock::duration startupTimeout;
  Clock::time_point deadline;
  Generation generation = 0;
  bool enabled = false;
  bool sessionStarted = false;
  bool unbound = false;
  bool stopping = false;
};

// Used by the actual pump for both endpoint writes and inbound frame handling.
// The caller retains this buffer until every byte is accepted. Transient errors
// and startup ESHUTDOWN never advance the offset or fetch another message.
template <class Write, class Before, class Retry, class Pause, class Stopped>
void pumpPendingBytes(const void *buffer, size_t length, Write write,
                      Before before, Retry retry, Pause pause, Stopped stopped) {
  size_t offset = 0;
  while (offset < length) {
    if (stopped())
      return;
    auto generation = before();
    errno = 0;
    auto result = write(static_cast<const char *>(buffer) + offset, length - offset);
    int error = errno;
    if (result > 0) {
      if (static_cast<size_t>(result) > length - offset)
        throw std::runtime_error("transport write exceeded pending byte count");
      offset += static_cast<size_t>(result);
    } else if (result == 0) {
      throw std::runtime_error("transport write returned zero without progress");
    } else if (error == EINTR) {
      continue;
    } else if (error == EAGAIN || error == EWOULDBLOCK) {
      pause();
    } else if (error == ESHUTDOWN) {
      retry(generation);
    } else {
      throw std::system_error(error, std::generic_category(), "transport write");
    }
  }
}
