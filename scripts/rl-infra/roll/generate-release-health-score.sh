#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./generate-release-health-score.sh <metrics_json> [out_json]
#
# metrics_json fields:
# - real_policy_rate
# - fallback_rate
# - simulation_rate
# - p95_latency_ms
# - error_rate
# - rollback_triggered (bool, optional)
# - mttr_minutes (optional)

INPUT="${1:-}"
OUT="${2:-release-health-score.json}"

if [ -z "${INPUT}" ]; then
  echo "Usage: $0 <metrics_json> [out_json]"
  exit 1
fi

if [ ! -f "${INPUT}" ]; then
  echo "input file not found: ${INPUT}"
  exit 1
fi

python3 - <<'PY' "${INPUT}" "${OUT}"
import json
import sys
from pathlib import Path

src = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
out = Path(sys.argv[2])

real_policy = float(src.get("real_policy_rate", 0.0))
fallback = float(src.get("fallback_rate", 1.0))
simulation = float(src.get("simulation_rate", 1.0))
p95 = float(src.get("p95_latency_ms", 9999.0))
error = float(src.get("error_rate", 1.0))
rollback = bool(src.get("rollback_triggered", False))
mttr = float(src.get("mttr_minutes", 999.0))

# 100-point score with penalties
score = 100.0
score -= max(0.0, (0.95 - real_policy)) * 200
score -= max(0.0, fallback - 0.01) * 500
score -= max(0.0, simulation) * 1000
score -= max(0.0, (p95 - 1500) / 100)
score -= max(0.0, error - 0.02) * 600
if rollback:
    score -= 8
score -= max(0.0, mttr - 10) * 0.5
score = max(0.0, min(100.0, score))

grade = "A"
if score < 90:
    grade = "B"
if score < 80:
    grade = "C"
if score < 70:
    grade = "D"

result = {
    "score": round(score, 2),
    "grade": grade,
    "inputs": src,
    "rule": "Weighted penalties from reliability, latency, fallback, simulation and rollback/MTTR",
}

out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"generated {out}")
PY
