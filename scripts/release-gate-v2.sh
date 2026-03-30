#!/usr/bin/env bash
# MODULE_STATUS_BOARD v2 — 可执行发布门禁（Decision OS）
# 1) M1: npm run test:ao-gate-p0
# 2) C3: npm run readiness:p1 → artifacts/readiness_report.json
# 3) C1: 需存在 artifacts/e2e_run_log.json（准生产手工跑通后由 SRE/BE 放入，见 artifacts/e2e_run_log.example.json）
# 输出: artifacts/release_gate_report.json 等
#
# 环境变量:
#   READINESS_P1_SKIP_* — 透传 readiness-p1.sh
#   C1_E2E_LOG_PATH — 覆盖 C1 日志路径（默认 artifacts/e2e_run_log.json）
#   RELEASE_GATE_C1_STRICT=1 — e2e_run_log.json 含 c1_soft_pass 时 C1 BLOCK（准生产签字）

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ART="$ROOT/artifacts"
mkdir -p "$ART"

export READINESS_P1_REPORT="${READINESS_P1_REPORT:-$ART/readiness_report.json}"

M1_EXIT=0
npm run test:ao-gate-p0 || M1_EXIT=$?
export M1_EXIT

READINESS_EXIT=0
npm run readiness:p1 || READINESS_EXIT=$?
export READINESS_REPORT_PATH="$READINESS_P1_REPORT"

node "$ROOT/scripts/release-gate-v2-write.mjs"
RG_EXIT=$?

echo "release-gate:v2 — artifacts under $ART (exit=$RG_EXIT)"
exit "$RG_EXIT"
