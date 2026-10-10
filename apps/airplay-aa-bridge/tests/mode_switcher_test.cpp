// Compile the actual production event loop with fail-closed configfs objects
// and scripted ep0 syscalls. No filesystem, socket, USB or gadget I/O occurs.
#include "AoaControl.h"
#include "ModeSwitcherMocks.h"
#include <algorithm>
#include <cassert>
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <iostream>
#include <linux/usb/functionfs.h>
#include <sstream>
#include <stdexcept>
#include <string>
#include <sys/select.h>
#include <unistd.h>
#include <vector>

namespace aoa_test {
enum class Kind { Write, Read, Poll };
struct Operation {
  Kind kind;
  size_t count;
  ssize_t result;
  int error;
  std::vector<uint8_t> bytes;
  bool statusAck = false;
};
struct Context {
  std::vector<Operation> operations;
  std::vector<std::string> trace;
  size_t consumed = 0;
  bool opened = false;
  bool closed = false;
};
Context *current = nullptr;
constexpr int FakeFd = 73;
void lifecycle(const char *operation) {
  assert(current != nullptr); current->trace.emplace_back(operation);
}
const Operation &consume(Kind kind, size_t count) {
  assert(current && current->opened && !current->closed);
  assert(current->consumed < current->operations.size());
  const auto &operation = current->operations[current->consumed++];
  assert(operation.kind == kind && operation.count == count);
  errno = operation.error;
  return operation;
}
int open(const char *path, int flags) {
  assert(current && !current->opened);
  const std::string expected = "/mock/aoa/AAServer_mp_loopback_initial/ep0";
  assert(path == expected);
  assert(flags == (O_RDWR | O_NONBLOCK));
  current->opened = true; lifecycle("ep0-open"); return FakeFd;
}
int close(int fd) {
  assert(fd == FakeFd && current && current->opened && !current->closed);
  current->closed = true; lifecycle("ep0-close"); return 0;
}
ssize_t write(int fd, const void *data, size_t count) {
  assert(fd == FakeFd);
  const auto &operation = consume(Kind::Write, count);
  if (!operation.bytes.empty()) {
    assert(data && operation.bytes.size() == count);
    assert(std::memcmp(data, operation.bytes.data(), count) == 0);
  }
  lifecycle(count == 0 ? "stall-out" : "ep0-write");
  return operation.result;
}
ssize_t read(int fd, void *data, size_t count) {
  assert(fd == FakeFd);
  const auto &operation = consume(Kind::Read, count);
  assert(operation.bytes.size() <= count);
  if (!operation.bytes.empty()) {
    assert(data); std::memcpy(data, operation.bytes.data(), operation.bytes.size());
  }
  if (operation.statusAck) {
    assert(count == 0 && operation.result == 0 && data != nullptr);
    lifecycle("start-status-complete");
  } else {
    lifecycle(count == 0 ? "stall-in" : "ep0-read");
  }
  return operation.result;
}
int select(int nfds, fd_set *reads, fd_set *writes, fd_set *errors, timeval *timeout) {
  assert(nfds == FakeFd + 1 && reads && FD_ISSET(FakeFd, reads));
  assert(!writes && !errors && timeout && timeout->tv_sec == 0 && timeout->tv_usec == 100000);
  return static_cast<int>(consume(Kind::Poll, 0).result);
}
} // namespace aoa_test

// All real syscall headers have already been included; only calls inside the
// production source below are replaced. The mocks reject every unplanned call.
#define open aoa_test::open
#define close aoa_test::close
#define write aoa_test::write
#define read aoa_test::read
#define select aoa_test::select
#include "../patches/ModeSwitcher.cpp"
#undef open
#undef close
#undef write
#undef read
#undef select

namespace {
using aoa_test::Context;
using aoa_test::Kind;
using aoa_test::Operation;
using airplay_aa::AoaSetup;

void little16(void *destination, uint16_t value) {
  auto *bytes = static_cast<uint8_t *>(destination);
  bytes[0] = static_cast<uint8_t>(value);
  bytes[1] = static_cast<uint8_t>(value >> 8);
}
std::vector<uint8_t> eventBytes(uint8_t type, const AoaSetup &setup = {0, 0, 0, 0, 0}) {
  usb_functionfs_event event{};
  event.type = type;
  event.u.setup.bRequestType = setup.requestType;
  event.u.setup.bRequest = setup.request;
  little16(&event.u.setup.wValue, setup.value);
  little16(&event.u.setup.wIndex, setup.index);
  little16(&event.u.setup.wLength, setup.length);
  const auto *bytes = reinterpret_cast<const uint8_t *>(&event);
  return {bytes, bytes + sizeof event};
}
void addEvent(Context &context, uint8_t type, const AoaSetup &setup = {0, 0, 0, 0, 0}) {
  context.operations.push_back({Kind::Poll, 0, 1, 0, {}});
  context.operations.push_back({Kind::Read, 4 * sizeof(usb_functionfs_event),
      sizeof(usb_functionfs_event), 0, eventBytes(type, setup)});
}
Context initialized() {
  const auto descriptors = airplay_aa::initialAoaDescriptors();
  const auto strings = airplay_aa::initialAoaStrings();
  Context context;
  context.operations.push_back({Kind::Write, descriptors.size(),
      static_cast<ssize_t>(descriptors.size()), 0, descriptors});
  context.operations.push_back({Kind::Write, strings.size(),
      static_cast<ssize_t>(strings.size()), 0, strings});
  return context;
}
void addStart(Context &context, ssize_t result = 0, int error = 0) {
  addEvent(context, FUNCTIONFS_SETUP, {0x40, 53, 0, 0, 0});
  context.operations.push_back({Kind::Read, 0, result, error, {}, result == 0});
}
void run(Context &context, bool expectFailure) {
  assert(aoa_test::current == nullptr);
  aoa_test::current = &context;
  std::ostringstream log;
  auto *previous = std::cout.rdbuf(log.rdbuf());
  bool failed = false;
  try { ModeSwitcher::handleSwitchToAccessoryMode(Library{}); }
  catch (const std::exception &) { failed = true; }
  std::cout.rdbuf(previous);
  assert(failed == expectFailure);
  assert(context.consumed == context.operations.size());
  assert(context.closed);
  const auto position = [&](const std::string &entry) {
    return std::find(context.trace.begin(), context.trace.end(), entry);
  };
  assert(position("ep0-close") < position("ffs-destroy"));
  assert(position("ffs-destroy") < position("gadget-destroy"));
  if (!expectFailure) {
    assert(position("start-status-complete") != context.trace.end());
    assert(position("start-status-complete") < position("ep0-close"));
  }
  aoa_test::current = nullptr;
}

void testProtocolIdentityStartBeforeEnable() {
  auto context = initialized();
  addEvent(context, FUNCTIONFS_BIND);
  // The actual loop must handle AOA before FUNCTIONFS_ENABLE. No ENABLE event
  // is supplied, matching CONFIG0_SETUP routing before SET_CONFIGURATION.
  addEvent(context, FUNCTIONFS_SETUP, {0xc0, 51, 0, 0, 2});
  context.operations.push_back({Kind::Write, 2, 2, 0, {2, 0}});
  addEvent(context, FUNCTIONFS_SETUP, {0x40, 52, 0, 2, 4});
  context.operations.push_back({Kind::Read, 4, 4, 0, {'a', 'b', 'c', 0}});
  addStart(context);
  run(context, false);
}

void testUnrelatedAndMalformedControls() {
  for (const auto &setup : std::vector<AoaSetup>{{0x40, 99, 0, 0, 0},
           {0x00, 53, 0, 0, 0}, {0x41, 53, 0, 0, 0}, {0xc0, 53, 0, 0, 0},
           {0x40, 53, 1, 0, 0}, {0x40, 53, 0, 1, 0}, {0x40, 53, 0, 0, 1},
           {0x40, 52, 0, 6, 1}}) {
    auto context = initialized();
    addEvent(context, FUNCTIONFS_SETUP, setup);
    const auto kind = (setup.requestType & 0x80) ? Kind::Read : Kind::Write;
    context.operations.push_back({kind, 0, -1, airplay_aa::AoaStallError, {}});
    // If the first completion falsely switched, these remaining calls would
    // be unconsumed. Only the following explicit valid53 authorizes return.
    addStart(context);
    run(context, false);
  }
}

void testEventStreamFailures() {
  for (ssize_t result : {ssize_t(0), ssize_t(1), ssize_t(11)}) {
    auto context = initialized();
    context.operations.push_back({Kind::Poll, 0, 1, 0, {}});
    context.operations.push_back({Kind::Read, 4 * sizeof(usb_functionfs_event), result, 0, {}});
    run(context, true);
  }
  for (int error : {EINTR, EAGAIN}) {
    auto context = initialized();
    context.operations.push_back({Kind::Poll, 0, 1, 0, {}});
    context.operations.push_back({Kind::Read, 4 * sizeof(usb_functionfs_event), -1, error, {}});
    addStart(context); run(context, false);
  }
  for (int error : {EIO, ESHUTDOWN}) {
    auto context = initialized();
    context.operations.push_back({Kind::Poll, 0, 1, 0, {}});
    context.operations.push_back({Kind::Read, 4 * sizeof(usb_functionfs_event), -1, error, {}});
    run(context, true);
  }
  auto context = initialized();
  context.operations.push_back({Kind::Poll, 0, -1, EINTR, {}});
  context.operations.push_back({Kind::Poll, 0, 0, 0, {}});
  addStart(context); run(context, false);
}

void testControlAndDescriptorFailures() {
  for (int error : {EINTR, EIDRM, ESHUTDOWN, EIO}) {
    auto context = initialized();
    addStart(context, -1, error); run(context, true);
  }
  for (ssize_t result : {ssize_t(0), ssize_t(1), ssize_t(-1)}) {
    auto context = initialized();
    addEvent(context, FUNCTIONFS_SETUP, {0xc0, 51, 0, 0, 2});
    context.operations.push_back({Kind::Write, 2, result, result < 0 ? EIO : 0, {2, 0}});
    run(context, true);
  }
  for (const auto &bytes : std::vector<std::vector<uint8_t>>{{'a', 'b', 'c', 'd'},
                                                           {0xc0, 0x80, 'a', 0}}) {
    auto context = initialized();
    addEvent(context, FUNCTIONFS_SETUP, {0x40, 52, 0, 0, 4});
    context.operations.push_back({Kind::Read, 4, 4, 0, bytes});
    run(context, true);
  }
  for (bool shortWrite : {false, true}) {
    auto context = initialized();
    context.operations.resize(1);
    context.operations[0].result = shortWrite ? 1 : -1;
    context.operations[0].error = shortWrite ? 0 : EIO;
    run(context, true);
    assert(std::find(context.trace.begin(), context.trace.end(), "gadget-enable") == context.trace.end());
  }
}
} // namespace

int main() {
  testProtocolIdentityStartBeforeEnable();
  testUnrelatedAndMalformedControls();
  testEventStreamFailures();
  testControlAndDescriptorFailures();
  std::cout << "Compiled production ModeSwitcher event-loop tests passed" << std::endl;
}
