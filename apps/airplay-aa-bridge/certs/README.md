# Android Auto engineering TLS identity

`android_auto.crt` / `android_auto.key` are the public Google Automotive Link
engineering identity embedded in Google Desktop Head Unit (XOR-0x27 obfuscated
in the binary). They are **not secret**.

Stock AACS ships a different CarService phone cert that expired 2022-08-24.
Head units and DHU reject that cert (`certificate has expired` / car often shows
**"device is not responding"** after AOAP). These files replace it
(valid through **2048**).

## Install on the Pi (required before car test)

From a Mac with the Pi on LAN:

```bash
./scripts/install-certs.sh quirino@10.0.0.112
```

Or on the Pi as root (from `/opt/airplay-aa` or this repo):

```bash
sudo ./scripts/install-certs.sh
```

Verify:

```bash
openssl x509 -in /opt/airplay-aa/libexec/aaserver/android_auto.crt -noout -dates
# Expect notAfter=... 2048
```

`install-pi.sh` / `build-deps.sh` prefer these certs when present so rebuilds do
not reinstate the expired AACS files.
