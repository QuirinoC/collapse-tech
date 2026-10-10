#pragma once
#include <cassert>
#include <string>
#include <utility>

// Fail-closed substitutes for the configfs/libusbgx surface. The compiled
// production ModeSwitcher runs normally, but these objects perform no I/O.
namespace aoa_test { void lifecycle(const char *operation); }

class Library {};
class Udc {
public:
  static Udc getUdcById(const Library &, int index) {
    assert(index == 0); return {};
  }
};
class Gadget {
public:
  Gadget(const Library &, int vid, int pid, const std::string &) {
    assert(vid == 0x12d1 && pid == 0x107e);
    aoa_test::lifecycle("gadget-create");
  }
  ~Gadget() { aoa_test::lifecycle("gadget-destroy"); }
  void setStrings(const std::string &, const std::string &, const std::string &) {}
  void enable(const Udc &) { aoa_test::lifecycle("gadget-enable"); }
};
class FfsFunction {
public:
  FfsFunction(const Gadget &, const std::string &, const char *) {
    aoa_test::lifecycle("ffs-create");
  }
  ~FfsFunction() { aoa_test::lifecycle("ffs-destroy"); }
};
class Configuration {
public:
  Configuration(const Gadget &, const std::string &) {}
  void addFunction(const FfsFunction &, const std::string &) {
    aoa_test::lifecycle("ffs-configured");
  }
};

inline std::string rr(const std::string &value) { return value; }
inline std::string sr(const std::string &value) { return value; }

namespace boost { namespace filesystem {
class path {
public:
  explicit path(std::string value) : text(std::move(value)) {}
  const char *c_str() const { return text.c_str(); }
  friend path operator/(const path &left, const std::string &right) {
    return path(left.text + "/" + right);
  }
private:
  std::string text;
};
inline path temp_directory_path() { return path("/mock/aoa"); }
inline void create_directory(const path &) { aoa_test::lifecycle("mountpoint-create"); }
} }
