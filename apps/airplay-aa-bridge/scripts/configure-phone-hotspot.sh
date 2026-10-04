#!/usr/bin/env bash
# Create/update NetworkManager profile for Juan's phone Personal Hotspot.
# Prefer ethernet when available; hotspot is fallback when eth is down.
#
# Usage (on the Pi, or via ssh):
#   sudo ./configure-phone-hotspot.sh "SSID" "PASSWORD"
#   sudo ./configure-phone-hotspot.sh "SSID" "PASSWORD" "Profile Name"
set -euo pipefail

SSID="${1:-}"
PASS="${2:-}"
CONN_ID="${3:-iPhone Juan}"
ETH_CONN="${ETH_CONN:-Wired connection 1}"

if [[ -z "$SSID" || -z "$PASS" ]]; then
  echo "Usage: $0 \"SSID\" \"PASSWORD\" [connection-name]" >&2
  echo "Example: $0 \"iPhone Juan\" \"your-hotspot-password\"" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Re-run with sudo (needs NetworkManager)." >&2
  exit 1
fi

if ! command -v nmcli >/dev/null; then
  echo "nmcli not found — this Pi expects NetworkManager." >&2
  exit 1
fi

# Keep eth preferred (higher autoconnect-priority wins).
if nmcli -t -f NAME connection show | grep -qx "$ETH_CONN"; then
  nmcli connection modify "$ETH_CONN" \
    connection.autoconnect yes \
    connection.autoconnect-priority 100
fi

if nmcli -t -f NAME connection show | grep -qx "$CONN_ID"; then
  echo "==> Updating existing connection: $CONN_ID"
  nmcli connection modify "$CONN_ID" \
    connection.autoconnect yes \
    connection.autoconnect-priority 10 \
    802-11-wireless.ssid "$SSID" \
    802-11-wireless-security.key-mgmt wpa-psk \
    802-11-wireless-security.psk "$PASS" \
    ipv4.method auto \
    ipv4.route-metric 600 \
    ipv6.method auto
else
  echo "==> Creating connection: $CONN_ID"
  nmcli connection add type wifi ifname wlan0 con-name "$CONN_ID" ssid "$SSID" \
    connection.autoconnect yes \
    connection.autoconnect-priority 10 \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$PASS" \
    ipv4.method auto \
    ipv4.route-metric 600 \
    ipv6.method auto
fi

nmcli connection reload
echo "==> Done. Priorities:"
nmcli -t -f NAME,AUTOCONNECT,AUTOCONNECT-PRIORITY connection show
echo
echo "Eth stays preferred. Hotspot joins automatically when eth is down and the SSID is visible."
echo "Test (optional, may briefly move wlan0): nmcli connection up \"$CONN_ID\""
