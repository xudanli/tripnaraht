#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./verify-ramp-with-proof.sh <live_traffic_summary.json> <ab_uplift_evaluation.json> <target_traffic_percent> [sample_coverage.json] [ab_uplift_stratified.json]

LIVE_SUMMARY="${1:-}"
AB_EVAL="${2:-}"
TARGET_TRAFFIC="${3:-0}"
SAMPLE_COVERAGE_FILE="${4:-}"
AB_STRATIFIED_FILE="${5:-}"

if [ -z "${LIVE_SUMMARY}" ] || [ -z "${AB_EVAL}" ]; then
  echo "Usage: $0 <live_traffic_summary.json> <ab_uplift_evaluation.json> <target_traffic_percent> [sample_coverage.json] [ab_uplift_stratified.json]"
  exit 1
fi

if [ ! -f "${LIVE_SUMMARY}" ] || [ ! -f "${AB_EVAL}" ]; then
  echo "proof files missing"
  exit 1
fi

if [ -n "${SAMPLE_COVERAGE_FILE}" ] && [ ! -f "${SAMPLE_COVERAGE_FILE}" ]; then
  echo "sample coverage file missing: ${SAMPLE_COVERAGE_FILE}"
  exit 1
fi

if [ -n "${AB_STRATIFIED_FILE}" ] && [ ! -f "${AB_STRATIFIED_FILE}" ]; then
  echo "stratified AB file missing: ${AB_STRATIFIED_FILE}"
  exit 1
fi

python3 - <<'PY' "${LIVE_SUMMARY}" "${AB_EVAL}" "${TARGET_TRAFFIC}" "${SAMPLE_COVERAGE_FILE}" "${AB_STRATIFIED_FILE}"
import json
import sys
from pathlib import Path

live = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
ab = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
target = int(sys.argv[3])
sample_path = sys.argv[4]
strat_path = sys.argv[5]

real_policy_rate = float(live.get("real_policy_rate", 0.0))
fallback_rate = float(live.get("fallback_rate", 1.0))
simulation_rate = float(live.get("simulation_rate", 1.0))
decision = str(ab.get("decision", "CONTINUE")).upper()

errors = []

# 基础 proof 门槛（与 ramp 脚本阈值一致）
if real_policy_rate < 0.95:
    errors.append(f"real_policy_rate too low: {real_policy_rate}")
if fallback_rate > 0.01:
    errors.append(f"fallback_rate too high: {fallback_rate}")
if simulation_rate > 0.0:
    errors.append(f"simulation_rate must be 0: {simulation_rate}")

# 放量决策规则：
# - >=30% 放量必须 PROMOTE
# - 10% 放量允许 CONTINUE 或 PROMOTE
if target >= 30 and decision != "PROMOTE":
    errors.append(f"target traffic {target}% requires PROMOTE, got {decision}")
if target < 30 and decision == "REJECT":
    errors.append(f"target traffic {target}% cannot proceed with REJECT decision")

# 可选：样本覆盖率门禁（建议阈值 2/3）
if sample_path:
    coverage = json.loads(Path(sample_path).read_text(encoding="utf-8"))
    user_cov = float(coverage.get("user_segment_coverage", 0.0))
    budget_cov = float(coverage.get("budget_segment_coverage", 0.0))
    dest_cov = float(coverage.get("destination_segment_coverage", 0.0))
    min_cov = min(user_cov, budget_cov, dest_cov)
    if min_cov < 0.67:
        errors.append(
            f"segment coverage too low: user={user_cov}, budget={budget_cov}, destination={dest_cov}"
        )

# 可选：分层评估门禁
if strat_path:
    strat = json.loads(Path(strat_path).read_text(encoding="utf-8"))
    strat_decision = str(strat.get("decision", "CONTINUE")).upper()
    if target >= 30 and strat_decision != "PROMOTE":
        errors.append(
            f"target traffic {target}% requires stratified PROMOTE, got {strat_decision}"
        )
    if target < 30 and strat_decision == "REJECT":
        errors.append(
            f"target traffic {target}% blocked by stratified decision {strat_decision}"
        )

if errors:
    print("[proof] failed")
    for e in errors:
        print(f"- {e}")
    sys.exit(1)

print(f"[proof] pass: target={target}% decision={decision} real_policy_rate={real_policy_rate} fallback_rate={fallback_rate}")
PY
