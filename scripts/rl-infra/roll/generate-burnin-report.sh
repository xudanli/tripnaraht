#!/usr/bin/env bash
set -euo pipefail

INPUT_FILE="${1:-burnin-summary.jsonl}"
OUT_JSON="${2:-burnin-report.json}"
OUT_MD="${3:-burnin-report.md}"

if [ ! -f "${INPUT_FILE}" ]; then
  echo "input file not found: ${INPUT_FILE}"
  exit 1
fi

python3 - <<'PY' "${INPUT_FILE}" "${OUT_JSON}" "${OUT_MD}"
import json
import sys
from pathlib import Path

input_path = Path(sys.argv[1])
out_json = Path(sys.argv[2])
out_md = Path(sys.argv[3])

total = 0
ok = 0
http_error = 0
fallback = 0
simulation = 0

for line in input_path.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line:
        continue
    total += 1
    try:
        item = json.loads(line)
    except Exception:
        http_error += 1
        continue
    if item.get("ok") is True:
        ok += 1
        resp = item.get("response", {})
        # response may be object or string depending on producer
        text = json.dumps(resp, ensure_ascii=False) if isinstance(resp, dict) else str(resp)
        if "fallback-v1.0" in text or "默认策略" in text:
            fallback += 1
        if "模拟策略推理" in text:
            simulation += 1
    else:
        if item.get("type") == "http_error":
            http_error += 1

def rate(x, n):
    return (x / n) if n > 0 else 0.0

summary = {
    "total_samples": total,
    "ok_samples": ok,
    "http_errors": http_error,
    "fallback_hits": fallback,
    "simulation_hits": simulation,
    "success_rate": round(rate(ok, total), 6),
    "fallback_rate": round(rate(fallback, total), 6),
    "simulation_rate": round(rate(simulation, total), 6),
    "http_error_rate": round(rate(http_error, total), 6),
}

out_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

md = f"""# Burn-in Report

- Total samples: {summary['total_samples']}
- Success samples: {summary['ok_samples']}
- HTTP errors: {summary['http_errors']}
- Fallback hits: {summary['fallback_hits']}
- Simulation hits: {summary['simulation_hits']}
- Success rate: {summary['success_rate']:.6f}
- Fallback rate: {summary['fallback_rate']:.6f}
- Simulation rate: {summary['simulation_rate']:.6f}
- HTTP error rate: {summary['http_error_rate']:.6f}
"""

out_md.write_text(md, encoding="utf-8")
print(f"generated {out_json} and {out_md}")
PY
