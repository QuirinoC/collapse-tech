// Distributed under GPLv3 only as specified in repository's root LICENSE file
// AirPlay-AA-Bridge fork: on modern kernels/libusbgx, creating a mass-storage
// function with inline LUN attrs (or set_lun_attrs batch) returns
// USBG_ERROR_INVALID_PARAM. Create the function, then set lun.0 attrs in order
// (cdrom/ro before file). CD-ROM LUNs must be read-only.

#include "MassStorageFunction.h"
#include "Gadget.h"
#include "utils.h"
#include <ServerUtils.h>
#include <usbg/function/ms.h>

using namespace std;

MassStorageFunction::MassStorageFunction(const Gadget &gadget,
                                         const string &function_name,
                                         const string &lun) {
  usbg_function *function;
  checkUsbgError(usbg_create_function(
      gadget.getGadget(), usbg_function_type::USBG_F_MASS_STORAGE,
      function_name.c_str(), NULL, &function));

  usbg_f_ms *ms = usbg_to_ms_function(function);
  checkUsbgError(usbg_f_ms_set_lun_cdrom(ms, 0, true));
  checkUsbgError(usbg_f_ms_set_lun_ro(ms, 0, true));
  checkUsbgError(usbg_f_ms_set_lun_removable(ms, 0, true));
  checkUsbgError(usbg_f_ms_set_lun_file(ms, 0, lun.c_str()));
  this->function = function;
}
