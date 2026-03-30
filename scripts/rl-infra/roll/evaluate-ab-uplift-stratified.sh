#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./evaluate-ab-uplift-stratified.sh <control_segments.json> <treatment_segments.json> [out_json]
#
# Input format:
# {
#   "segments": {
#     "new_user": {"sample_size": 200, "accept_rate": 0.61, "adherence_rate": 0.72, "satisfaction_score": 4.1},
#     "returning_user": {...}
#   }
# }

CONTROL_FILE="${1:-}"
TREATMENT_FILE="${2:-}"
OUT_JSON="${3:-ab-uplift-stratified.json}"

if [ -z "${CONTROL_FILE}" ] || [ -z "${TREATMENT_FILE}" ]; then
  echo "Usage: $0 <control_segments.json> <treatment_segments.json> [out_json]"
  exit 1
fi

if [ ! -f "${CONTROL_FILE}" ] || [ ! -f "${TREATMENT_FILE}" ]; then
  echo "input file missing"
  exit 1
fi

python3 - <<'PY' "${CONTROL_FILE}" "${TREATMENT_FILE}" "${OUT_JSON}"
import json
import math
import sys
from pathlib import Path

control = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")).get("segments", {})
treat = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8")).get("segments", {})
out = Path(sys.argv[3])

def two_proportion_z_test(p1, n1, p2, n2):
    if min(n1, n2) <= 0:
        return 1.0
    x1 = p1 * n1
    x2 = p2 * n2
    p = (x1 + x2) / (n1 + n2)
    denom = math.sqrt(max(1e-12, p * (1 - p) * (1 / n1 + 1 / n2)))
    z = (p2 - p1) / denom
    cdf = 0.5 * (1 + math.erf(abs(z) / math.sqrt(2)))
    return max(0.0, min(1.0, 2 * (1 - cdf)))

segments = sorted(set(control.keys()) & set(treat.keys()))
metrics = ["accept_rate", "adherence_rate", "satisfaction_score"]

results = {}
positive_significant = 0
regression = 0
coverage_total = 0
coverage_segments = 0

for seg in segments:
    c = control[seg]
    t = treat[seg]
    n1 = int(c.get("sample_size", 0))
    n2 = int(t.get("sample_size", 0))
    seg_total = n1 + n2
    if seg_total > 0:
        coverage_segments += 1
        coverage_total += seg_total

    seg_res = {"sample_size_control": n1, "sample_size_treatment": n2, "metrics": {}}
    seg_positive = 0
    seg_regress = 0
    for m in metrics:
        cv = float(c.get(m, 0.0))
        tv = float(t.get(m, 0.0))
        abs_u = tv - cv
        rel_u = (abs_u / cv) if cv != 0 else 0.0
        if m in ("accept_rate", "adherence_rate"):
            pval = two_proportion_z_test(cv, max(n1, 1), tv, max(n2, 1))
        else:
            pval = 0.05 if abs_u > 0 else 1.0
        sig = pval < 0.05
        if abs_u > 0 and sig:
            seg_positive += 1
        if abs_u < 0 and sig:
            seg_regress += 1
        seg_res["metrics"][m] = {
            "control": round(cv, 6),
            "treatment": round(tv, 6),
            "absolute_uplift": round(abs_u, 6),
            "relative_uplift": round(rel_u, 6),
            "p_value": round(pval, 6),
            "significant": sig,
        }

    if seg_positive >= 2:
        positive_significant += 1
    if seg_regress > 0:
        regression += 1
    seg_res["segment_decision"] = "PROMOTE" if seg_positive >= 2 else ("REJECT" if seg_regress > 0 else "CONTINUE")
    results[seg] = seg_res

decision = "CONTINUE"
if regression > 0:
    decision = "REJECT"
elif positive_significant >= max(1, math.ceil(len(segments) * 0.5)):
    decision = "PROMOTE"

output = {
    "segments_evaluated": len(segments),
    "segments_with_data": coverage_segments,
    "total_samples": coverage_total,
    "segment_results": results,
    "decision": decision,
    "rule": "REJECT if any segment has significant regression; PROMOTE if >=50% segments are positive+significant on >=2 metrics; else CONTINUE",
}

out.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"generated {out}")
PY
