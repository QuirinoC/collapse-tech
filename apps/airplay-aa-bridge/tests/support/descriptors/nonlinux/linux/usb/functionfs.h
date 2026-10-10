#pragma once
#include <linux/types.h>

// Narrow Linux UAPI layout fixture for macOS. Linux builds use real UAPI
// headers instead; no descriptor payload or expected packet sizes live here.
constexpr uint32_t FUNCTIONFS_HAS_FS_DESC = 1;
constexpr uint32_t FUNCTIONFS_HAS_HS_DESC = 2;
constexpr uint32_t FUNCTIONFS_ALL_CTRL_RECIP = 64;
constexpr uint32_t FUNCTIONFS_DESCRIPTORS_MAGIC_V2 = 3;
constexpr uint32_t FUNCTIONFS_STRINGS_MAGIC = 2;
constexpr uint8_t USB_DT_INTERFACE = 4;
constexpr uint8_t USB_DT_ENDPOINT = 5;
constexpr uint8_t USB_CLASS_VENDOR_SPEC = 0xff;
constexpr uint8_t USB_SUBCLASS_VENDOR_SPEC = 0xff;
constexpr uint8_t USB_ENDPOINT_XFER_BULK = 2;
constexpr uint8_t USB_DIR_IN = 0x80;
constexpr uint8_t USB_DIR_OUT = 0;

struct usb_functionfs_descs_head_v2 {
  __le32 magic;
  __le32 length;
  __le32 flags;
} __attribute__((packed));
struct usb_functionfs_strings_head {
  __le32 magic;
  __le32 length;
  __le32 str_count;
  __le32 lang_count;
} __attribute__((packed));
struct usb_interface_descriptor {
  uint8_t bLength;
  uint8_t bDescriptorType;
  uint8_t bInterfaceNumber;
  uint8_t bAlternateSetting;
  uint8_t bNumEndpoints;
  uint8_t bInterfaceClass;
  uint8_t bInterfaceSubClass;
  uint8_t bInterfaceProtocol;
  uint8_t iInterface;
} __attribute__((packed));
struct usb_endpoint_descriptor_no_audio {
  uint8_t bLength;
  uint8_t bDescriptorType;
  uint8_t bEndpointAddress;
  uint8_t bmAttributes;
  __le16 wMaxPacketSize;
  uint8_t bInterval;
} __attribute__((packed));

static_assert(sizeof(usb_functionfs_descs_head_v2) == 12, "Linux FunctionFS header ABI");
static_assert(sizeof(usb_functionfs_strings_head) == 16, "Linux FunctionFS strings ABI");
static_assert(sizeof(usb_interface_descriptor) == 9, "Linux USB interface ABI");
static_assert(sizeof(usb_endpoint_descriptor_no_audio) == 7, "Linux USB endpoint ABI");
