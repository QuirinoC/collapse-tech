# Android Auto PHONE identity

AAServer acts as the phone and must present a current **CarService** identity.
The head unit checks both identity role and certificate trust. The TLS cipher
being established alone does not prove authentication completed.

The legacy `android_auto.crt` / `android_auto.key` in this directory were
extracted from Google Desktop Head Unit. They are **HEAD-UNIT** material:
`O=Android-Auto-Internal, OU=01`, valid through 2048. Installing them on AAServer
is incorrect. A real DHU run on October 10, 2026 completed AOAP, protocol 1.5,
and TLS 1.2, then rejected them with `Invalid peer certificate name` and an
authentication failure. The default validator therefore rejects these files.

Upstream AACS distinguishes its head-unit identity (2048) from its phone
identity (expired August 24, 2022) in [PR #19](https://github.com/tomasz-grobelny/AACS/pull/19).
[Issue #15](https://github.com/tomasz-grobelny/AACS/issues/15) describes obtaining
updated phone credentials from a current Android Auto implementation. A
head-unit identity, a self-signed replacement, or an edited expiry date does
not supply a trusted phone identity.

## Validate and install a current phone identity

Keep the current certificate and matching key outside the tracked source tree,
named `android_auto.crt` and `android_auto.key`. Never print key material.

```bash
./scripts/check-phone-certs.sh /path/to/current-phone-identity

# From the Mac, with the Pi reachable:
AIRPLAY_AA_CERT_DIR=/path/to/current-phone-identity \
  ./scripts/install-certs.sh quirino@10.0.0.113

# Or locally on the Pi:
sudo env AIRPLAY_AA_CERT_DIR=/path/to/current-phone-identity \
  ./scripts/install-certs.sh
```

`AIRPLAY_AA_OPENSSL_BIN` optionally selects an OpenSSL executable. On a Mac,
OpenSSL 3 can be selected with
`AIRPLAY_AA_OPENSSL_BIN=/opt/homebrew/opt/openssl@3/bin/openssl`.

The guard checks exact organization `O=CarService`, current `notBefore` and
`notAfter`, and matching public keys before copies or restarts. These are
necessary checks; trust and real authentication still require a clean DHU/car
session. There is no hardcoded expiry year. Recheck dates before every build
or installation because phone credentials may have a short lifetime.
`AIRPLAY_AA_SKIP_RESTART=1` suppresses the certificate installer's restart when
a deployment coordinates one service stop and one restart itself; only `0`
and `1` are accepted, and the default is `0`.

`install-dhu-certs.sh` now extracts only local files named `headunit.crt` and
`headunit.key` under `.local/dhu-headunit/`, and refuses installation on a Pi.

## Current bench candidate

A signed `O=CarService` pair was located in
[Modern-Apps, commit 950a52c](https://github.com/vayun-mathur/Modern-Apps/tree/950a52c8bb77ddfceff308f1b9c1bceca79ed7d6/auto/protocol/src/main/assets/gal).
Its certificate expires **December 9, 2026 at 18:39:03 UTC**. Its public key
matches the accompanying key and its signature verifies against the GAL root
embedded in this DHU. These offline checks do not establish a passing USB/video
session or guarantee every car's acceptance. The bench report records live
authentication and decoded rendering separately.

The October 10, 2026 hardware run also authenticated this pair: DHU reported
`Verify returned: ok` and the Pi reported `auth complete`. Video discovery and
decoded rendering require their own passing bench evidence.
