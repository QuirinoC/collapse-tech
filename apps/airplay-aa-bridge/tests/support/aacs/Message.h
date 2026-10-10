// Minimal AACS transport envelope for compiling the real channel handlers.
#pragma once
#include <cstdint>
#include <vector>
class Message {
public:
  uint8_t channel = 0;
  uint8_t flags = 0;
  std::vector<uint8_t> content;
  int offset = 0;
};
