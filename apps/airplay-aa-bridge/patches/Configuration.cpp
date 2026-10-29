// Distributed under GPLv3 only as specified in repository's root LICENSE file
#include "Configuration.h"
#include "Function.h"
#include "Gadget.h"
#include "utils.h"
#include <ServerUtils.h>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <string>

using namespace std;

Configuration::Configuration(const Gadget &gadget, const string &name) {
  const char *configuredPower = getenv("AIRPLAY_AA_USB_POWER");
  const string power = configuredPower ? configuredPower : "bus";
  if (power != "bus" && power != "external")
    throw runtime_error("AIRPLAY_AA_USB_POWER must be bus or external");
  const bool external = power == "external";
  usbg_config_attrs c_attrs{};
  c_attrs.bmAttributes = external ? 0xc0 : 0x80;
  // libusbgx's struct member is only uint8_t, but configfs MaxPower is mA.
  // Use the int setter below: storing 500 in this member silently wraps.
  c_attrs.bMaxPower = 0;
  usbg_config_strs c_strs{};
  char cfg[200];
  snprintf(cfg, sizeof cfg, "%s", name.c_str());
  c_strs.configuration = cfg;
  usbg_config *created;
  checkUsbgError(usbg_create_config(gadget.getGadget(), 1, name.c_str(),
                                  &c_attrs, &c_strs, &created));
  checkUsbgError(usbg_set_config_max_power(created, external ? 0 : 500));
  this->config = created;
}

void Configuration::addFunction(const Function &fun, const string &name) {
  checkUsbgError(usbg_add_config_function(config, name.c_str(), fun.getFunction()));
}
