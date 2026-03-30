#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./verify-week1-3-readiness.sh [out_json]

OUT_JSON="${1:-week1-3-readiness-report.json}"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${ROOT_DIR}/../../.." && pwd)"

checks=()
failed=0

add_check() {
  local name="$1"
  local status="$2"
  local detail="$3"
  checks+=("{\"name\":\"${name}\",\"status\":\"${status}\",\"detail\":\"${detail}\"}")
  if [ "${status}" != "pass" ]; then
    failed=$((failed + 1))
  fi
}

require_file() {
  local path="$1"
  local name="$2"
  if [ -f "${REPO_ROOT}/${path}" ]; then
    add_check "${name}" "pass" "${path}"
  else
    add_check "${name}" "fail" "missing ${path}"
  fi
}

require_executable() {
  local path="$1"
  local name="$2"
  if [ -x "${REPO_ROOT}/${path}" ]; then
    add_check "${name}" "pass" "${path}"
  elif [ -f "${REPO_ROOT}/${path}" ]; then
    add_check "${name}" "warn" "not executable: ${path}"
  else
    add_check "${name}" "fail" "missing ${path}"
  fi
}

# Week1-3 workflows
require_file ".github/workflows/roll-staging-gate.yml" "workflow_staging_gate"
require_file ".github/workflows/roll-prod-guardrails-gate.yml" "workflow_prod_guardrails"
require_file ".github/workflows/roll-staging-burnin.yml" "workflow_staging_burnin"
require_file ".github/workflows/roll-live-proof.yml" "workflow_live_proof"
require_file ".github/workflows/roll-prod-ramp-gate.yml" "workflow_prod_ramp"
require_file ".github/workflows/roll-auto-rollback.yml" "workflow_auto_rollback"
require_file ".github/workflows/roll-release-health-score.yml" "workflow_release_health_score"

# Key scripts
require_executable "scripts/rl-infra/roll/verify-staging-no-simulation.sh" "script_verify_staging"
require_executable "scripts/rl-infra/roll/verify-prod-guardrails.sh" "script_verify_prod_guardrails"
require_executable "scripts/rl-infra/roll/run-staging-burnin.sh" "script_staging_burnin"
require_executable "scripts/rl-infra/roll/generate-burnin-report.sh" "script_burnin_report"
require_executable "scripts/rl-infra/roll/generate-live-traffic-summary.sh" "script_live_summary"
require_executable "scripts/rl-infra/roll/evaluate-ab-uplift.sh" "script_ab_eval"
require_executable "scripts/rl-infra/roll/evaluate-ab-uplift-stratified.sh" "script_ab_eval_stratified"
require_executable "scripts/rl-infra/roll/check-sample-coverage.sh" "script_sample_coverage"
require_executable "scripts/rl-infra/roll/verify-prod-ramp-thresholds.sh" "script_ramp_thresholds"
require_executable "scripts/rl-infra/roll/verify-ramp-with-proof.sh" "script_ramp_with_proof"
require_executable "scripts/rl-infra/roll/resolve-ramp-threshold-profile.sh" "script_ramp_profile"
require_executable "scripts/rl-infra/roll/canary-rollout.sh" "script_canary_rollout"
require_executable "scripts/rl-infra/roll/canary-rollback.sh" "script_canary_rollback"
require_executable "scripts/rl-infra/roll/rollback-cooldown-guard.sh" "script_rollback_cooldown"
require_executable "scripts/rl-infra/roll/rollback-consecutive-guard.sh" "script_rollback_consecutive"
require_executable "scripts/rl-infra/roll/generate-release-health-score.sh" "script_release_health_score"
require_executable "scripts/rl-infra/roll/trigger-roll-auto-rollback-dispatch.sh" "script_dispatch_trigger"

# Docs
require_file "scripts/rl-infra/roll/CI_CD_INTEGRATION.md" "doc_ci_cd"
require_file "scripts/rl-infra/roll/BRIDGE_CONTRACT.md" "doc_bridge_contract"
require_file "scripts/rl-infra/roll/ALERTMANAGER_GITHUB_DISPATCH.md" "doc_alertmanager_dispatch"
require_file "scripts/rl-infra/roll/WEEK1_LAUNCH_CHECKLIST.md" "doc_week1_checklist"
require_file "scripts/rl-infra/roll/WEEK1_OWNERSHIP_MATRIX.md" "doc_week1_ownership"
require_file "scripts/rl-infra/roll/WEEK1_STEERING_ONE_PAGER.md" "doc_week1_steering"
require_file "scripts/rl-infra/roll/SRE_ACCEPTANCE_REPORT_TEMPLATE.md" "doc_sre_template"

status="PASS"
if [ "${failed}" -gt 0 ]; then
  status="FAIL"
fi

{
  echo "{"
  echo "  \"status\": \"${status}\","
  echo "  \"failed_checks\": ${failed},"
  echo "  \"checks\": ["
  (IFS=,; echo "    ${checks[*]}")
  echo "  ]"
  echo "}"
} > "${OUT_JSON}"

echo "[readiness] status=${status} failed_checks=${failed} report=${OUT_JSON}"

if [ "${status}" = "FAIL" ]; then
  exit 1
fi
