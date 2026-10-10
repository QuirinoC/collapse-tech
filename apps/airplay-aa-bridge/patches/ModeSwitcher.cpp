// Distributed under GPLv3 only as specified in repository's root LICENSE file

#include "ModeSwitcher.h"
#include "AoaControl.h"
#include "Configuration.h"
#include "FfsFunction.h"
#include "Gadget.h"
#include "Library.h"
#include "Udc.h"
#include "utils.h"
#include <boost/filesystem.hpp>
#include <fcntl.h>
#include <iostream>
#include <linux/usb/functionfs.h>
#include <sys/select.h>
#include <unistd.h>
#include <vector>

namespace {

class FileDescriptor {
public:
  explicit FileDescriptor(int value) : fd(value) {
    if (fd < 0)
      throw std::system_error(errno, std::generic_category(), "open initial ep0");
  }
  ~FileDescriptor() { close(fd); }
  operator int() const { return fd; }
private:
  int fd;
};

uint16_t little16(const void *value) {
  const auto *bytes = static_cast<const uint8_t *>(value);
  return static_cast<uint16_t>(bytes[0] | (bytes[1] << 8));
}

void writeBlob(int fd, const std::vector<uint8_t> &data) {
  const auto written = airplay_aa::invokeAoaTransfer(
      [&] { return write(fd, data.data(), data.size()); });
  if (written < 0)
    throw std::system_error(errno, std::generic_category(), "write initial FunctionFS descriptors");
  if (static_cast<size_t>(written) != data.size())
    throw std::runtime_error("short initial FunctionFS descriptor write");
}

void writeInitialDescriptors(int fd) {
  // Keep the existing zero-endpoint vendor interface and ALL_CTRL_RECIP. AOA
  // requests may arrive before SET_CONFIGURATION, so CONFIG0_SETUP is required.
  static_assert(airplay_aa::InitialAoaFlags ==
      (FUNCTIONFS_HAS_FS_DESC | FUNCTIONFS_HAS_HS_DESC |
       FUNCTIONFS_ALL_CTRL_RECIP | FUNCTIONFS_CONFIG0_SETUP), "FunctionFS flags");
  static_assert(FUNCTIONFS_DESCRIPTORS_MAGIC_V2 == 3 &&
      FUNCTIONFS_STRINGS_MAGIC == 2 && USB_DT_INTERFACE == 4 &&
      USB_CLASS_VENDOR_SPEC == 0xff && USB_SUBCLASS_VENDOR_SPEC == 0xff,
      "FunctionFS descriptor ABI");
  writeBlob(fd, airplay_aa::initialAoaDescriptors());
  writeBlob(fd, airplay_aa::initialAoaStrings());
}

bool handleEvents(int fd, const usb_functionfs_event *events, size_t count) {
  for (size_t index = 0; index < count; ++index) {
    const auto &event = events[index];
    if (event.type != FUNCTIONFS_SETUP) {
      std::cout << "Initial FunctionFS event " << unsigned(event.type) << std::endl;
      continue;
    }
    const auto &setup = event.u.setup;
    const airplay_aa::AoaSetup request{setup.bRequestType, setup.bRequest,
        little16(&setup.wValue), little16(&setup.wIndex), little16(&setup.wLength)};
    const bool switched = airplay_aa::handleAoaSetup(request,
        [fd](bool input, void *buffer, size_t length) {
          return airplay_aa::invokeAoaTransfer([&] {
            return input ? write(fd, buffer, length) : read(fd, buffer, length);
          });
        });
    std::cout << "Initial AOA request " << unsigned(request.request)
              << (switched ? " completed; switch to accessory mode" : " handled")
              << std::endl;
    if (switched)
      return true;
  }
  return false;
}

} // namespace

void ModeSwitcher::handleSwitchToAccessoryMode(const Library &lib) {
  installUsbInterruptHandler();
  Gadget initialGadget(lib, 0x12d1, 0x107e, rr("initial_state"));
  initialGadget.setStrings("TAG", "AAServer", sr("TAGAAS"));

  const auto mountpoint = boost::filesystem::temp_directory_path() /
                          rr("AAServer_mp_loopback_initial");
  create_directory(mountpoint);
  FfsFunction function(initialGadget, rr("ffs_initial"), mountpoint.c_str());
  Configuration configuration(initialGadget, "c0");
  configuration.addFunction(function, "loopback_initial");

  FileDescriptor fd(open((mountpoint / "ep0").c_str(), O_RDWR | O_NONBLOCK));
  writeInitialDescriptors(fd);
  const auto udc = Udc::getUdcById(lib, 0);
  initialGadget.enable(udc);

  usb_functionfs_event events[4];
  for (;;) {
    fd_set ready;
    FD_ZERO(&ready);
    FD_SET(fd, &ready);
    timeval timeout{0, 100000};
    const int selected = select(fd + 1, &ready, nullptr, nullptr, &timeout);
    if (selected < 0) {
      if (errno == EINTR)
        continue;
      throw std::system_error(errno, std::generic_category(), "poll initial FunctionFS ep0");
    }
    if (selected == 0)
      continue; // Waiting for a host is intentionally not a transfer timeout.
    const ssize_t length = read(fd, events, sizeof events);
    if (length < 0) {
      if (errno == EINTR)
        continue;
      if (errno == EAGAIN || errno == EWOULDBLOCK) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        continue;
      }
      throw std::system_error(errno, std::generic_category(), "read initial FunctionFS events");
    }
    if (length == 0)
      throw std::runtime_error("initial FunctionFS event stream closed before AOA start");
    if (length % sizeof events[0] != 0)
      throw std::runtime_error("partial initial FunctionFS event");
    if (handleEvents(fd, events, static_cast<size_t>(length) / sizeof events[0]))
      break;
  }
  // Closing ep0 and destroying this scoped initial gadget precede the caller's
  // accessory gadget construction. No generic EOF or failed transfer switches.
}
