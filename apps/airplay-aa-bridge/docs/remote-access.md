# Pi remote access (LAN + phone hotspot)

How `amber-pi` gets online and how to SSH when it leaves the home LAN (car / phone hotspot).

## How the Pi gets online

NetworkManager manages interfaces (not dhcpcd).

| Link | Profile | Role |
|------|---------|------|
| `eth0` | `Wired connection 1` | Preferred. Home bench: **10.0.0.112** |
| `wlan0` | `iPhone Juan` | Autoconnect fallback when eth is down (phone Personal Hotspot) |
| `usb0` | USB Gadget (client/shared) | Car Android Auto gadget — **do not change** for remote access |

Policy: **ethernet wins when present** (autoconnect-priority 100). Phone hotspot is priority 10 and uses a higher IPv4 route metric so eth stays default route if both are up.

Update hotspot SSID/password on the Pi:

```bash
# From Mac, with Pi on eth:
scp apps/airplay-aa-bridge/scripts/configure-phone-hotspot.sh quirino@10.0.0.112:/tmp/
ssh quirino@10.0.0.112 'bash /tmp/configure-phone-hotspot.sh "SSID" "PASSWORD"'
```

## Always-SSH (Tailscale)

Tailscale is installed on the Pi as hostname **`amber-pi`**, with hotspot-safe settings:

- `--accept-dns=false` (no MagicDNS /resolv.conf hijack — historically broke iPhone cellular/DNS64)
- `--netfilter-mode=off`
- `TS_DEBUG_DERP_ONLY=1` on `tailscaled` (avoid UDP DERP burst on iPhone hotspot NAT)

**From Mac (after both sides are logged into the same Tailscale account):**

```bash
ssh quirino@amber-pi
# or, if MagicDNS is off on the Mac:
ssh quirino@<tailscale-ip>   # from: tailscale ip -4   on the Pi
```

LAN still works when home:

```bash
ssh quirino@10.0.0.112    # eth
# aliases: amber-pi-eth / amber-pi-wifi (SSH config)
```

### Mac setup

1. Finish installing **Tailscale** (installer was opened from `/tmp/Tailscale.pkg`, or App Store / `brew install --cask tailscale`).
2. Log in with the **same** Tailscale account used on the Pi.
3. Prefer disabling “Use Tailscale DNS” on the Mac if you hit DNS weirdness; not required for SSH by IP.

### Pi login (one-shot)

If `tailscale status` on the Pi says Logged out:

```bash
ssh quirino@10.0.0.112
sudo tailscale up --accept-dns=false --netfilter-mode=off --hostname=amber-pi
# open the printed https://login.tailscale.com/a/... URL and approve
```

## Fallback: reverse SSH (only if Tailscale unusable)

If Tailscale still breaks phone hotspot internet, use a reverse tunnel to a host that stays on the home LAN (`juan@10.0.0.220`). That only works when the Pi can **initiate** SSH to that host from the hotspot (needs a public IP / port-forward or other path to home — private `10.0.0.220` is not reachable from cellular alone). Prefer fixing Tailscale first.

## Do not break car path

Leave USB gadget NetworkManager profiles and `airplay-aa-bridge` alone. Remote access is eth/wlan/Tailscale only.
