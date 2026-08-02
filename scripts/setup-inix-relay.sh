#!/usr/bin/env bash
# Provision a small US (Texas) SOCKS5 relay for Inix Region Relay.
# Run on a fresh Ubuntu 22.04+ VPS in Dallas or Houston (Vultr, DO, Linode, etc.).
#
# Usage (as root):
#   export INIX_RELAY_USER="inix"
#   export INIX_RELAY_PASS="$(openssl rand -hex 24)"
#   bash setup-inix-relay.sh
#
# Then set on your PC before launching Inix (see relay.env.example):
#   INIX_RELAY_HOST=<vps-ip>
#   INIX_RELAY_PORT=1080
#   INIX_RELAY_USER / INIX_RELAY_PASS

set -euo pipefail

RELAY_USER="${INIX_RELAY_USER:-inix}"
RELAY_PASS="${INIX_RELAY_PASS:-}"
RELAY_PORT="${INIX_RELAY_PORT:-1080}"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root (sudo bash $0)" >&2
  exit 1
fi

if [[ -z "$RELAY_PASS" ]]; then
  RELAY_PASS="$(openssl rand -hex 24)"
  echo "Generated INIX_RELAY_PASS=$RELAY_PASS"
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ufw dante-server openssl

# Firewall: SSH + relay port only
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow "${RELAY_PORT}/tcp"
ufw --force enable

# Dante SOCKS5 — authenticated, no open relay
cat >/etc/danted.conf <<EOF
logoutput: syslog
internal: 0.0.0.0 port = ${RELAY_PORT}
external: eth0
socksmethod: username
clientmethod: none
user.privileged: root
user.unprivileged: nobody

client pass {
  from: 0.0.0.0/0 to: 0.0.0.0/0
  log: connect disconnect
}

socks pass {
  from: 0.0.0.0/0 to: 0.0.0.0/0
  log: connect disconnect
}
EOF

# Create relay user (system account for auth)
if ! id "$RELAY_USER" &>/dev/null; then
  useradd -r -s /usr/sbin/nologin "$RELAY_USER"
fi
echo "${RELAY_USER}:${RELAY_PASS}" | chpasswd

systemctl enable danted
systemctl restart danted

PUBLIC_IP="$(curl -4 -s ifconfig.me || hostname -I | awk '{print $1}')"

cat <<EOF

Inix relay ready.

  Host: ${PUBLIC_IP}
  Port: ${RELAY_PORT}
  User: ${RELAY_USER}
  Pass: ${RELAY_PASS}

Add to relay.env (or system env) on your PC:

  INIX_RELAY_HOST=${PUBLIC_IP}
  INIX_RELAY_PORT=${RELAY_PORT}
  INIX_RELAY_USER=${RELAY_USER}
  INIX_RELAY_PASS=${RELAY_PASS}

Token rotation: change password with \`passwd ${RELAY_USER}\`, update INIX_RELAY_PASS, restart Inix.
Optional bandwidth cap (if sharing): use \`ufw limit ${RELAY_PORT}/tcp\` or provider firewall rules.

Do not expose this relay without authentication.

EOF
