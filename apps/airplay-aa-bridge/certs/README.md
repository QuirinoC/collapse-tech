# Android Auto engineering TLS identity

`android_auto.crt` / `android_auto.key` are the public Google Automotive Link
engineering identity embedded in Google Desktop Head Unit (XOR-0x27 obfuscated
in the binary). They are **not secret**.

Stock AACS ships a different CarService phone cert that expired 2022-08-24.
DHU rejects that cert (`certificate has expired`). These files replace it for
Mac DHU testing (valid through 2048).

Install on the Pi:

```bash
sudo cp certs/android_auto.* /opt/airplay-aa/libexec/aaserver/
sudo systemctl restart airplay-aa-bridge
```

Or from a Mac with DHU downloaded: `./scripts/install-dhu-certs.sh user@pi`.
