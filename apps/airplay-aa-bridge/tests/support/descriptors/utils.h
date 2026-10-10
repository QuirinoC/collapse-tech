#pragma once
#include <cerrno>
#include <cstdint>
#include <initializer_list>
#include <stdexcept>
#include <system_error>
#include <sys/types.h>

// Only endian conversion and the positive-write check used by descriptors.cpp.
// Descriptor writes below use a real pipe, without mocked serialization or I/O.
constexpr uint16_t cpu_to_le16(uint16_t value) {
#if __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__
  return value;
#else
  return __builtin_bswap16(value);
#endif
}
constexpr uint32_t cpu_to_le32(uint32_t value) {
#if __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__
  return value;
#else
  return __builtin_bswap32(value);
#endif
}
inline ssize_t checkError(ssize_t result, std::initializer_list<int>) {
  if (result < 0)
    throw std::system_error(errno, std::generic_category(), "descriptor write");
  if (result == 0)
    throw std::runtime_error("descriptor write made no progress");
  return result;
}
