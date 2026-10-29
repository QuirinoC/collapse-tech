#pragma once
#include <cstdint>
#include <stdexcept>
#include <string>
struct usbg_config {};
struct usbg_gadget {};
struct usbg_function {};
// Keep the real libusbgx narrow struct member to detect 500mA truncation bugs.
struct usbg_config_attrs { uint8_t bmAttributes, bMaxPower; };
struct usbg_config_strs { char *configuration; };
int usbg_create_config(usbg_gadget *, int, const char *, const usbg_config_attrs *,
                       const usbg_config_strs *, usbg_config **);
int usbg_set_config_max_power(usbg_config *, int);
int usbg_add_config_function(usbg_config *, const char *, usbg_function *);
inline void checkUsbgError(int value) {
  if (value) throw std::runtime_error("libusbgx error");
}
class Gadget {
public:
  usbg_gadget *getGadget() const { return nullptr; }
};
class Function {
public:
  usbg_function *getFunction() const { return nullptr; }
};
class Configuration {
  usbg_config *config = nullptr;
public:
  Configuration(const Gadget &, const std::string &);
  void addFunction(const Function &, const std::string &);
};
