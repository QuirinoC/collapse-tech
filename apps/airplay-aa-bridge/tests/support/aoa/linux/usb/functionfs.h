#pragma once
#include <cstdint>

// Narrow Linux UAPI fixture used only to compile ModeSwitcher on non-Linux
// hosts. Values/layout are from include/uapi/linux/usb/{ch9,functionfs}.h.
constexpr uint32_t FUNCTIONFS_HAS_FS_DESC = 1;
constexpr uint32_t FUNCTIONFS_HAS_HS_DESC = 2;
constexpr uint32_t FUNCTIONFS_ALL_CTRL_RECIP = 64;
constexpr uint32_t FUNCTIONFS_CONFIG0_SETUP = 128;
constexpr uint32_t FUNCTIONFS_DESCRIPTORS_MAGIC_V2 = 3;
constexpr uint32_t FUNCTIONFS_STRINGS_MAGIC = 2;
constexpr uint8_t USB_DT_INTERFACE = 4;
constexpr uint8_t USB_CLASS_VENDOR_SPEC = 0xff;
constexpr uint8_t USB_SUBCLASS_VENDOR_SPEC = 0xff;
constexpr uint8_t FUNCTIONFS_BIND = 0;
constexpr uint8_t FUNCTIONFS_UNBIND = 1;
constexpr uint8_t FUNCTIONFS_ENABLE = 2;
constexpr uint8_t FUNCTIONFS_DISABLE = 3;
constexpr uint8_t FUNCTIONFS_SETUP = 4;
struct usb_ctrlrequest {
  uint8_t bRequestType;
  uint8_t bRequest;
  uint16_t wValue;
  uint16_t wIndex;
  uint16_t wLength;
} __attribute__((packed));
struct usb_functionfs_event {
  union { usb_ctrlrequest setup; } u;
  uint8_t type;
  uint8_t padding[3];
} __attribute__((packed));
static_assert(sizeof(usb_ctrlrequest) == 8, "Linux USB setup ABI");
static_assert(sizeof(usb_functionfs_event) == 12, "Linux FunctionFS event ABI");
