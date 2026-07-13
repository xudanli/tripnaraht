#!/usr/bin/env bash
# One-time: authorize devbox SSH key on Frankfurt ECS for reverse tunnel.
# Run manually if BatchMode SSH fails:
#   ssh root@47.87.131.183
#   mkdir -p ~/.ssh && echo '<devbox-pubkey>' >> ~/.ssh/authorized_keys
set -euo pipefail

FRANKFURT_HOST="${FRANKFURT_HOST:-root@47.87.131.183}"
PUBKEY_FILE="${PUBKEY_FILE:-$HOME/.ssh/id_ed25519.pub}"

if [[ ! -f "$PUBKEY_FILE" ]]; then
  echo "No pubkey at $PUBKEY_FILE" >&2
  exit 1
fi

echo "=== Devbox pubkey (add to Frankfurt ~/.ssh/authorized_keys) ==="
cat "$PUBKEY_FILE"
echo ""
echo "=== Test SSH (interactive password if key not yet installed) ==="
echo "ssh-copy-id -i $PUBKEY_FILE $FRANKFURT_HOST"
echo ""
echo "After key installed, verify:"
echo "ssh -o BatchMode=yes $FRANKFURT_HOST 'echo ok'"
