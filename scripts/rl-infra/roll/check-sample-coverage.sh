#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./check-sample-coverage.sh <events_jsonl> [out_json]
#
# Optional event fields:
# - user_segment: new_user|returning_user
# - budget_segment: low|mid|high
# - destination_segment: domestic|regional|longhaul

INPUT_FILE="${1:-}"
OUT_JSON="${2:-sample-coverage.json}"

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
import sys
from pathlib import Path

src = Path(sys.argv[1])
dst = Path(sys.argv[2])

user_expected = {"new_user", "returning_user"}
budget_expected = {"low", "mid", "high"}
dest_expected = {"domestic", "regional", "longhaul"}

user_seen = {}
budget_seen = {}
dest_seen = {}

total = 0
for raw in src.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line:
        continue
    try:
        e = json.loads(line)
    except Exception:
        continue
    total += 1
    us = str(e.get("user_segment", "")).strip()
    bs = str(e.get("budget_segment", "")).strip()
    ds = str(e.get("destination_segment", "")).strip()
    if us:
        user_seen[us] = user_seen.get(us, 0) + 1
    if bs:
        budget_seen[bs] = budget_seen.get(bs, 0) + 1
    if ds:
        dest_seen[ds] = dest_seen.get(ds, 0) + 1

def coverage(seen, expected):
    hit = len(set(seen.keys()) & expected)
    return 0.0 if len(expected) == 0 else hit / len(expected)

out = {
    "total_events": total,
    "user_segment_counts": user_seen,
    "budget_segment_counts": budget_seen,
    "destination_segment_counts": dest_seen,
    "user_segment_coverage": round(coverage(user_seen, user_expected), 6),
    "budget_segment_coverage": round(coverage(budget_seen, budget_expected), 6),
    "destination_segment_coverage": round(coverage(dest_seen, dest_expected), 6),
}

dst.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"generated {dst}")
PY
