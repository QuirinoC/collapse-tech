#pragma once
#include <arpa/inet.h>
#include <cassert>
#include <cstdint>
#include <vector>
#define be16_to_cpu(x) ntohs(x)
#define GSTCHECK(x) assert(x)
inline void pushBackInt16(std::vector<uint8_t> &out, uint16_t value) {
  out.push_back(value >> 8);
  out.push_back(value & 0xff);
}
inline void pushBackInt64(std::vector<uint8_t> &out, uint64_t value) {
  for (int shift = 56; shift >= 0; shift -= 8)
    out.push_back((value >> shift) & 0xff);
}
