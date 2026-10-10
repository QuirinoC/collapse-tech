// Compile and exercise the real production blob and writer. The descriptors
// travel through an actual pipe before parsing, so packing, endian conversion,
// lengths and speed-specific endpoint sizes are all checked together.
// Upstream deliberately omits interface number/alternate setting, whose
// aggregate defaults are zero and are checked below. GCC warns for these
// legal omissions; keep this exception confined to the upstream production
// include, with all warnings enforced for the test itself.
#if defined(__GNUC__) && !defined(__clang__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
#endif
#include "../patches/descriptors.cpp"
#if defined(__GNUC__) && !defined(__clang__)
#pragma GCC diagnostic pop
#endif
#include <algorithm>
#include <cassert>
#include <cstring>
#include <iostream>
#include <vector>

using Bytes = std::vector<uint8_t>;

static uint16_t le16(const Bytes &bytes, size_t offset) {
  assert(offset + 2 <= bytes.size());
  return static_cast<uint16_t>(bytes[offset] | (bytes[offset + 1] << 8));
}
static uint32_t le32(const Bytes &bytes, size_t offset) {
  assert(offset + 4 <= bytes.size());
  return static_cast<uint32_t>(bytes[offset]) |
         (static_cast<uint32_t>(bytes[offset + 1]) << 8) |
         (static_cast<uint32_t>(bytes[offset + 2]) << 16) |
         (static_cast<uint32_t>(bytes[offset + 3]) << 24);
}

static Bytes capture(void (*writer)(int)) {
  int fds[2];
  assert(pipe(fds) == 0);
  writer(fds[1]);
  assert(close(fds[1]) == 0);
  Bytes result;
  uint8_t buffer[256];
  for (;;) {
    const ssize_t count = read(fds[0], buffer, sizeof buffer);
    if (count < 0 && errno == EINTR)
      continue;
    assert(count >= 0);
    if (count == 0)
      break;
    result.insert(result.end(), buffer, buffer + count);
  }
  assert(close(fds[0]) == 0);
  return result;
}

static size_t checkSpeed(const Bytes &bytes, size_t offset, uint32_t count,
                         uint16_t packetSize, uint8_t endpoints) {
  const uint8_t interface[] = {9, 4, 0, 0, endpoints, 0xff, 0xff, 0, 1};
  assert(offset + sizeof interface <= bytes.size());
  assert(std::equal(std::begin(interface), std::end(interface), bytes.begin() + offset));
  offset += sizeof interface;
  assert(count == 1u + endpoints);
  for (uint8_t endpoint = 0; endpoint < endpoints; ++endpoint) {
    assert(offset + 7 <= bytes.size());
    assert(bytes[offset] == 7 && bytes[offset + 1] == 5);
    assert(bytes[offset + 2] == (endpoint == 0 ? 0x81 : 0x02));
    assert(bytes[offset + 3] == 2); // bulk
    assert(le16(bytes, offset + 4) == packetSize);
    assert(bytes[offset + 6] == 0);
    offset += bytes[offset];
  }
  return offset;
}

static void checkStrings(const Bytes &bytes, size_t offset) {
  assert(le32(bytes, offset) == 2); // FUNCTIONFS_STRINGS_MAGIC
  assert(le32(bytes, offset + 4) == bytes.size() - offset);
  assert(le32(bytes, offset + 8) == 1 && le32(bytes, offset + 12) == 1);
  assert(le16(bytes, offset + 16) == 0x0409);
  const char name[] = "Android Accessory Interface";
  assert(bytes.size() - offset == 18 + sizeof name);
  assert(std::memcmp(bytes.data() + offset + 18, name, sizeof name) == 0);
}

int main() {
  const Bytes accessory = capture(write_descriptors_accessory);
  assert(le32(accessory, 0) == 3); // FUNCTIONFS_DESCRIPTORS_MAGIC_V2
  assert(le32(accessory, 4) == 66);
  assert(le32(accessory, 8) == 3); // FS | HS; control flags preserved
  size_t offset = checkSpeed(accessory, 20, le32(accessory, 12), 64, 2);
  offset = checkSpeed(accessory, offset, le32(accessory, 16), 512, 2);
  assert(offset == le32(accessory, 4));
  assert(offset == sizeof descriptors_accessory);
  assert(std::memcmp(accessory.data(), &descriptors_accessory, offset) == 0);
  checkStrings(accessory, offset);

  // The initial descriptor in this source is unchanged by this narrow patch.
  const Bytes initial = capture(write_descriptors_default);
  assert(le32(initial, 0) == 3 && le32(initial, 4) == 38);
  assert(le32(initial, 8) == 67); // FS | HS | ALL_CTRL_RECIP
  offset = checkSpeed(initial, 20, le32(initial, 12), 0, 0);
  offset = checkSpeed(initial, offset, le32(initial, 16), 0, 0);
  assert(offset == le32(initial, 4));
  assert(offset == sizeof descriptors_default);
  checkStrings(initial, offset);
  std::cout << "Production accessory descriptor tests passed (FS64, HS512)\n";
}
