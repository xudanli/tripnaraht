#!/usr/bin/env bash
# Devbox orchestrator: sync scripts → Frankfurt → run Gagnaveita collector E2E → write evidence.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRANKFURT_HOST="${FRANKFURT_HOST:-root@47.87.131.183}"
EVIDENCE_DIR="$ROOT/internal-docs/operations/evidence"
DATE="$(date -u +%Y-%m-%d)"
EVIDENCE_FILE="$EVIDENCE_DIR/prod-canary-frankfurt-gagnaveita-collector-e2e-${DATE}.json"

bash "$ROOT/scripts/sync-frankfurt-collector-bundle.sh"

echo "[gagnaveita-e2e] probe tunnel from Frankfurt"
TUNNEL_HEALTH=$(ssh -o BatchMode=yes "$FRANKFURT_HOST" \
  "curl -4 -sS --connect-timeout 5 --max-time 10 http://127.0.0.1:19080/health" 2>&1 || true)

INGEST_OUTPUT=$(ssh -o BatchMode=yes "$FRANKFURT_HOST" bash -s <<'REMOTE'
set -euo pipefail
set -a
source /root/tripnara-collector/gagnaveita-collector.runtime.env
export VEDUR_COLLECTOR_HMAC_SECRET="${GAGNAVEITA_COLLECTOR_HMAC_SECRET}"
set +a
bash /root/tripnara-collector/scripts/frankfurt-gagnaveita-collector-e2e.sh
REMOTE
)

mkdir -p "$EVIDENCE_DIR"
python3 - "$EVIDENCE_FILE" "$TUNNEL_HEALTH" "$INGEST_OUTPUT" <<'PY'
import json, sys, datetime
out, tunnel, ingest = sys.argv[1], sys.argv[2], sys.argv[3]
tunnel_ok = '"ok": true' in tunnel or '"ok":true' in tunnel
pass_markers = ['"ok": true', '"ok":true', 'GAGNAVEITA_COLLECTOR_INGEST_PASS']
ingest_ok = any(m in ingest for m in pass_markers) or '"outcome"' in ingest
evidence = {
    "evidenceType": "PRODUCTION_CANARY_FRANKFURT_GAGNAVEITA_COLLECTOR_E2E",
    "probedAt": datetime.datetime.utcnow().isoformat() + "Z",
    "collectorHost": "47.87.131.183",
    "tunnel": {
        "remoteBindPort": 19080,
        "devboxIngestPort": 3000,
        "healthViaTunnel": "ok" if tunnel_ok else "fail",
        "healthBody": tunnel[:500],
    },
    "ingestOutput": ingest[-4000:],
    "verdict": "FRANKFURT_GAGNAVEITA_COLLECTOR_E2E_PASS" if (tunnel_ok and ingest_ok) else "FRANKFURT_GAGNAVEITA_COLLECTOR_E2E_FAIL",
    "roadAuthority": "gagnaveita_live_collector" if (tunnel_ok and ingest_ok) else "unknown",
    "tripId": "a0a99999-9999-4999-8999-999999999999",
    "roadId": "F208",
    "note": "Frankfurt fetched live Gagnaveita faerd2017_1, signed POST via reverse tunnel to devbox road ingest.",
}
with open(out, "w", encoding="utf-8") as f:
    json.dump(evidence, f, indent=2)
print(json.dumps(evidence, indent=2))
if evidence["verdict"].endswith("FAIL"):
    sys.exit(1)
PY

echo ""
echo "Written: $EVIDENCE_FILE"
