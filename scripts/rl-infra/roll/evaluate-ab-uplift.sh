#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./evaluate-ab-uplift.sh <control_metrics.json> <treatment_metrics.json> [out_json]
#
# expected metrics fields:
# - sample_size (int)
# - accept_rate (0..1)
# - satisfaction_score (0..5 or 0..1, consistent between groups)
# - adherence_rate (0..1)

CONTROL_FILE="${1:-}"
TREATMENT_FILE="${2:-}"
OUT_JSON="${3:-ab-uplift-evaluation.json}"

if [ -z "${CONTROL_FILE}" ] || [ -z "${TREATMENT_FILE}" ]; then
  echo "Usage: $0 <control_metrics.json> <treatment_metrics.json> [out_json]"
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

control = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
treat = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
out = Path(sys.argv[3])

def two_proportion_z_test(p1, n1, p2, n2):
    if min(n1, n2) <= 0:
        return 1.0
    x1 = p1 * n1
    x2 = p2 * n2
    p = (x1 + x2) / (n1 + n2)
    denom = math.sqrt(max(1e-12, p * (1 - p) * (1 / n1 + 1 / n2)))
    z = (p2 - p1) / denom
    # two-tailed p-value approximation using erf
    cdf = 0.5 * (1 + math.erf(abs(z) / math.sqrt(2)))
    pval = max(0.0, min(1.0, 2 * (1 - cdf)))
    return pval

n1 = int(control.get("sample_size", 0))
n2 = int(treat.get("sample_size", 0))

metrics = ["accept_rate", "adherence_rate", "satisfaction_score"]
res = {}
positive_significant = 0

for m in metrics:
    c = float(control.get(m, 0.0))
    t = float(treat.get(m, 0.0))
    abs_uplift = t - c
    rel_uplift = (abs_uplift / c) if c != 0 else 0.0
    if m in ("accept_rate", "adherence_rate"):
        pval = two_proportion_z_test(c, n1, t, n2)
    else:
        # satisfaction often continuous; conservative placeholder
        pval = 0.05 if abs_uplift > 0 else 1.0
    significant = pval < 0.05
    if abs_uplift > 0 and significant:
        positive_significant += 1
    res[m] = {
        "control": round(c, 6),
        "treatment": round(t, 6),
        "absolute_uplift": round(abs_uplift, 6),
        "relative_uplift": round(rel_uplift, 6),
        "p_value": round(pval, 6),
        "significant": significant,
    }

decision = "CONTINUE"
if positive_significant >= 2:
    decision = "PROMOTE"
elif any(v["absolute_uplift"] < 0 for v in res.values()):
    decision = "REJECT"

output = {
    "control_sample_size": n1,
    "treatment_sample_size": n2,
    "metrics": res,
    "decision": decision,
    "rule": "PROMOTE if >=2 metrics positive+significant; REJECT if any key metric regresses; else CONTINUE",
}

out.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"generated {out}")
PY
