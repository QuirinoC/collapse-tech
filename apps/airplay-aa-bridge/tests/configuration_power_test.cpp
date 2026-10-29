// Compile the production configuration builder against narrow libusbgx stubs.
#include "ConfigurationMocks.h"
#include <cassert>
#include <cstdlib>
#include <iostream>
namespace {
usbg_config config;
int created = 0, powerCalls = 0, powerMilliamps = -1, powerError = 0;
uint8_t attributes = 0;
}
int usbg_create_config(usbg_gadget *, int id, const char *name,
                       const usbg_config_attrs *attrs, const usbg_config_strs *strings,
                       usbg_config **result) {
  assert(id == 1 && std::string(name) == "c0");
  assert(std::string(strings->configuration) == "c0");
  assert(attrs->bMaxPower == 0); // Must use the full-width mA setter afterward.
  attributes = attrs->bmAttributes; *result = &config; ++created; return 0;
}
int usbg_set_config_max_power(usbg_config *actual, int milliamps) {
  assert(actual == &config); ++powerCalls; powerMilliamps = milliamps; return powerError;
}
int usbg_add_config_function(usbg_config *actual, const char *, usbg_function *) {
  assert(actual == &config); return 0;
}
#include "../patches/Configuration.cpp"
int main() {
  const char *previous = getenv("AIRPLAY_AA_USB_POWER");
  const std::string saved = previous ? previous : "";
  const bool hadPrevious = previous != nullptr;
  unsetenv("AIRPLAY_AA_USB_POWER");
  { Configuration c(Gadget{}, "c0"); c.addFunction(Function{}, "ffs"); }
  assert(attributes == 0x80 && powerMilliamps == 500 && powerCalls == 1);
  // Linux encodes USB2 MaxPower in 2mA wire units: 500mA becomes 250, not 125
  // and not the 244mA result of assigning 500 to libusbgx's uint8_t member.
  assert(powerMilliamps / 2 == 250);
  setenv("AIRPLAY_AA_USB_POWER", "external", 1);
  { Configuration c(Gadget{}, "c0"); }
  assert(attributes == 0xc0 && powerMilliamps == 0 && powerCalls == 2);
  for (const char *invalid : {"", "1", "self", "500"}) {
    setenv("AIRPLAY_AA_USB_POWER", invalid, 1);
    bool failed = false;
    try { Configuration c(Gadget{}, "c0"); } catch (const std::runtime_error &) { failed = true; }
    assert(failed && created == 2 && powerCalls == 2);
  }
  setenv("AIRPLAY_AA_USB_POWER", "bus", 1);
  powerError = -1;
  bool failed = false;
  try { Configuration c(Gadget{}, "c0"); } catch (const std::runtime_error &) { failed = true; }
  assert(failed); // Never enable a gadget when its power descriptor failed.
  if (hadPrevious) setenv("AIRPLAY_AA_USB_POWER", saved.c_str(), 1);
  else unsetenv("AIRPLAY_AA_USB_POWER");
  std::cout << "Production USB configuration power attributes and mA units passed\n";
}
