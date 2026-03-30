#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./generate-live-traffic-summary.sh <events_jsonl> [out_json]
#
# events_jsonl expects one JSON object per line. Recommended fields:
# - event: policy_decision|policy_fallback_used|simulation_used|simulation_blocked
# - request_id: string
# - success: bool (for policy_decision)
# - latency_ms: number (optional)
# - model_version: string (optional)

INPUT_FILE="${1:-}"
OUT_JSON="${2:-live-traffic-summary.json}"

if [ -z "${INPUT_FILE}" ]; then
  echo "Usage: $0 <events_jsonl> [out_json]"
  exit 1
fi

if [ ! -f "${INPUT_FILE}" ]; then
  echo "input file not found: ${INPUT_FILE}"
  exit 1
fi

python3 - <<'PY' "${INPUT_FILE}" "${OUT_JSON}"
import json
import statistics
import sys
from pathlib import Path

src = Path(sys.argv[1])
dst = Path(sys.argv[2])

total_policy_decisions = 0
policy_success = 0
fallback_used = 0
simulation_used = 0
simulation_blocked = 0
contract_violation = 0
latencies = []
by_model = {}

for raw in src.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line:
        continue
    try:
        e = json.loads(line)
    except Exception:
        continue

    event = str(e.get("event", ""))
    model = str(e.get("model_version", "unknown"))
    by_model.setdefault(model, {"policy_decisions": 0, "fallback_used": 0})

    if event == "policy_decision":
        total_policy_decisions += 1
        by_model[model]["policy_decisions"] += 1
        if bool(e.get("success", False)):
            policy_success += 1
        if isinstance(e.get("latency_ms"), (int, float)):
            latencies.append(float(e["latency_ms"]))
    elif event == "policy_fallback_used":
        fallback_used += 1
        by_model[model]["fallback_used"] += 1
    elif event == "simulation_used":
        simulation_used += 1
    elif event == "simulation_blocked":
        simulation_blocked += 1
    elif event == "contract_violation":
        contract_violation += 1

def rate(x, n):
    return (x / n) if n > 0 else 0.0

p95_latency = 0.0
if latencies:
    sorted_lat = sorted(latencies)
    idx = max(0, min(len(sorted_lat) - 1, int(0.95 * (len(sorted_lat) - 1))))
    p95_latency = sorted_lat[idx]

summary = {
    "total_policy_decisions": total_policy_decisions,
    "policy_success": policy_success,
    "fallback_used": fallback_used,
    "simulation_used": simulation_used,
    "simulation_blocked": simulation_blocked,
    "contract_violation": contract_violation,
    "real_policy_rate": round(rate(policy_success, total_policy_decisions), 6),
    "fallback_rate": round(rate(fallback_used, total_policy_decisions), 6),
    "simulation_rate": round(rate(simulation_used, total_policy_decisions), 6),
    "contract_violation_rate": round(rate(contract_violation, total_policy_decisions), 6),
    "p95_latency_ms": round(p95_latency, 2),
    "avg_latency_ms": round(statistics.mean(latencies), 2) if latencies else 0.0,
    "model_breakdown": by_model,
}

dst.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"generated {dst}")
PY
