# Car Bluetooth companion

`bridge/phone_bluetooth.py` provides the phone-side Bluetooth exchange missing
from the AA video injector. It is an independent process: its failure does not
block video, reset USB, restart the bridge, remove a bond, or set a device Trusted.

Mazda's [wired Android Auto instructions](https://connect.mazda.com/en/smartphone-integration/android-auto/type-a/index.html)
require Bluetooth enabled. This makes Bluetooth a relevant compatibility gap;
it does **not** establish that Bluetooth was the only reason this Mazda refused
projection. A DHU video pass does not prove a real car accepts Bluetooth, HFP, or
projection startup.

## What is allowed

The root-owned `/etc/airplay-aa/bluetooth.conf` must contain one known head-unit
Bluetooth address. The sidecar first reads the current AAServer connection's
service discovery, and only proceeds if it advertises that exact address and
numeric-comparison method 2. The Bluetooth channel number comes from this
response, not a fixed channel 9. A DHU without a Bluetooth service is skipped
without opening the BlueZ bus. Other advertised cars are refused.

For that connection only, it:

1. Checks the powered local adapter and waits a bounded time for its HFP Audio
   Gateway profile to register. It never powers an adapter or restarts audio.
2. Registers a restricted application agent, opens the advertised AA Bluetooth
   channel, and sends the Pi adapter address and numeric-comparison method.
3. Parses phone-side preparation status in field 1 and `already_paired` in field
   2 (absent means false). A disagreement with BlueZ's actual saved bond fails;
   the code never guesses another schema or deletes/replaces the old bond.
4. Discovers only the configured address if needed and calls BlueZ `Pair()`.
   Numeric confirmation is accepted only when the current six-digit AA
   challenge exactly matches the BlueZ callback for that peer. Either callback
   may arrive first. Missing, mismatched, changed, duplicate or expired
   confirmations are rejected. PIN entry and blind “just works” are rejected.
5. Sends AA `BluetoothAuthenticationResult` success after the matched BlueZ
   confirmation callback has been answered, **before waiting for bond
   completion**. This reports authentication-data processing, not a completed
   bond. Waiting for the bond first can deadlock a head unit that waits for this
   result before accepting its own numeric comparison.
6. Separately verifies BlueZ `Paired` and, when available, `Bonded`, then requests
   only the car's remote HFP Handsfree UUID. A successful profile method followed
   by a real connected, resolved bond is reported as HFP transport connected.
   Complete HFP AT/SCO readiness and AA video focus remain separate evidence.

The agent is never explicitly made the default agent. BlueZ can select a first
registered agent automatically when none existed; the agent still rejects all
unrelated devices and is unregistered at cleanup. Pairable is temporarily
changed only if necessary; optional Discoverable defaults to false. The
sidecar restores only properties it changed, cancels only its own pending Pair,
and releases only its own discovery request and agent. Existing bonds remain.

The default attempt lasts at most 60 seconds. After success, failure or skip, the
process retains its AA socket until detach; it cannot repeatedly pair within a
live connection. A runtime guard records AAServer's peer PID, process start time
and boot ID as a hash before any attempt, preventing a sidecar crash/restart from
repeating it. The bridge's AAServer process ends on detach. A corrupt guard fails
closed. The service has no network-online dependency.

## Install and observe

Install `python3-dbus`, `python3-gi`, and `bluez` on the Pi, plus the existing
phone audio backend that registers HFP Audio Gateway. Copy
`config/bluetooth.conf.example` to `/etc/airplay-aa/bluetooth.conf`, root-owned
mode 0600, and set `headunit_address` from the known car's captured AA service
discovery. Do not commit the private address or credentials.

Run `sudo scripts/install-bluetooth-sidecar.sh` from a staged project tree. This
installs the helper and independent systemd service; it enables the service only
if the private configuration exists and validates. Check with:

```sh
sudo /usr/bin/python3 /opt/airplay-aa/bridge/phone_bluetooth.py --check-config
systemctl status airplay-aa-bluetooth.service
journalctl -u airplay-aa-bluetooth.service -b --no-pager
```

Reports omit Bluetooth addresses, passkeys and authentication bytes. They expose
separate descriptor, channel, preparation, comparison, bond and HFP stages.
`pairing_diagnostic_passed` means the real BlueZ bond and HFP profile checks
passed; `aa_projection_ready` explicitly remains `NOT_TESTED`.

A deliberate retry requires a genuinely new AA connection (unplug/replug),
not repeatedly restarting this service. Disable it with
`systemctl disable --now airplay-aa-bluetooth.service`; this does not unpair the
car or alter the AA video pipeline.

## Protocol evidence and test limits

The message direction follows [OpenAuto's actual head-unit service](https://github.com/f1xpl/openauto/blob/master/src/autoapp/Service/BluetoothService.cpp):
it receives a pairing request from the phone. The response layout follows the
[modern phone schema](https://github.com/mrmees/open-android-auto/blob/main/oaa/bluetooth/BluetoothPairingResponseMessage.proto),
not the reversed older aasdk layout. The
[authentication result schema](https://github.com/mrmees/open-android-auto/blob/main/oaa/bluetooth/BluetoothAuthenticationResultMessage.proto)
and its documented auth-data-processing semantics support the result ordering.
Those reverse-engineered schema fields are not an official Google conformance
suite; the authentication messages remain marked unverified by that upstream.
Real Mazda wire responses still need to confirm this implementation's match.

The [BlueZ Agent API](https://bluez.readthedocs.io/en/latest/agent-api/) documents
application-agent scope and numeric confirmation. The
[BlueZ Device API](https://bluez.readthedocs.io/en/latest/device-api/) defines real
pairing state and `ConnectProfile`'s remote-service UUID.

`tests/test_phone_bluetooth.py` tests the production controller with a fake head
unit that refuses to finish bonding until it receives the AA authentication
result. It also covers callback ordering, refusal paths, private peer scope,
current-session lifetime, no-Bluetooth skips, D-Bus signatures and cleanup
ownership. These tests can catch a protocol deadlock and unsafe acceptance, but
cannot manufacture evidence of a real Bluetooth radio bond, HFP service-level
connection, or Mazda projection acceptance.
