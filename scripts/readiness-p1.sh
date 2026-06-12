#!/usr/bin/env bash
# P1 发布前聚合门禁：lint → check:physical（逻辑孤岛）→ typecheck:physics（P-E kernel）→ typecheck:trips（src/trips 闭包 + 依赖）→ build → ROLL Week1-3 文件校验（可跳过）→ AO P0 → Decision OS unit（normalize / traceability / LangGraph PRD / task memory）→ TD P0（含 TD-05 test:td-replay）→ AO P1 合同
# 输出 JSON 报告（默认 ./readiness-p1-report.json，schema readiness-p1/v2）；成功写出后可合并 P-CI-Pressure-1（physics/trips/root 三场 tsc 误差 → 耦合压力）
# 环境变量：
#   READINESS_P1_REPORT — 报告输出路径
#   READINESS_P1_SKIP_ROLL=1 — 跳过 ROLL Week1-3 文件校验
#   READINESS_P1_SKIP_LINT=1 — 跳过 eslint（仅本地应急；CI 不应设置）
#   READINESS_P1_SKIP_TD_REPLAY=1 — 仅跑 test:td-p0-core，跳过 npm run test:td-replay（TD-05；仅本地应急）
#   READINESS_P1_SKIP_EXECUTION_OS_STABILITY=1 — 跳过 npm run ci:execution-os-stability（SSC v1；仅本地应急；CI 不应设置）
#   READINESS_P1_SKIP_CID_V1=1 — 跳过 npm run ci:cid-v1（仅本地应急；CI 不应设置）
#   READINESS_P1_SKIP_ROUTE_ROUTING_GATE=1 — 跳过 npm run ci:route-and-run-routing（仅本地应急；CI 不应设置）
#   READINESS_P1_SKIP_ROUTING_CLASSIFIER_EVAL=1 — 跳过 npm run ci:routing-classifier-eval（P0-4；仅本地应急）
#   READINESS_P1_SKIP_PRESSURE=1 — 不跑三场压力合并（缩短本地 / CI 时间；不改变 exit code）
#   READINESS_P1_SKIP_TYPECHECK_TRIPS=1 — 跳过 npm run typecheck:trips（src/trips 闭包 + 依赖图；仅本地应急；CI 发布前不应跳过）
#   P-CI-2：可在报告 JSON 顶层加入可选 runtimeSignals: { ecoDriftRate, identityRejectRate, closureRetryRate } ∈ [0,1]（merge 时写入 fused 物理应力；缺省则仅静态 TS 应力）
#   P-CI-3：READINESS_P1_PRESSURE_PREV=上次 readiness JSON 路径 → 计算 gradient / forecast / control；READINESS_P1_CONTROL_OUT=路径 → 额外写出 ControlSignal JSON（不改 readiness exit code）
#   P-CI-6（decision engine）：TRIP_PCI6_ENGINE=1 — tick 内写入 signals.controlPhaseState / controlPhaseTransition 等（审计）；TRIP_PCI6_OVERRIDE=1 — 将 phase 收紧叠加到 pressureRegulation.control（须同时 ENGINE=1；默认不写、不改变行为）

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
REPORT="${READINESS_P1_REPORT:-$ROOT/readiness-p1-report.json}"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

GIT_SHA="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
GIT_SHORT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || true)"
if [ -z "$GIT_SHA" ]; then
  GIT_SHA="unknown"
  GIT_SHORT="unknown"
fi

lint_skipped="false"
lint=0
skills_audit=0
if [ "${READINESS_P1_SKIP_LINT:-}" = "1" ]; then
  lint_skipped="true"
  echo "readiness:p1 — SKIP lint (READINESS_P1_SKIP_LINT=1)"
else
  npm run lint || lint=1
fi

npm run skills:audit-usage || skills_audit=1
npm run skills:audit-descriptions:ci || skills_audit=1

physical_island=0
npm run check:physical || physical_island=1

physics_kernel=0
npm run typecheck:physics || physics_kernel=1

typecheck_trips=0
if [ "${READINESS_P1_SKIP_TYPECHECK_TRIPS:-}" = "1" ]; then
  echo "readiness:p1 — SKIP typecheck:trips (READINESS_P1_SKIP_TYPECHECK_TRIPS=1)"
else
  npm run typecheck:trips || typecheck_trips=1
fi

build=0
npm run build || build=1

roll_skipped="false"
roll_exit="null"
if [ "${READINESS_P1_SKIP_ROLL:-}" = "1" ]; then
  roll_skipped="true"
  roll_exit="null"
else
  chmod +x scripts/rl-infra/roll/verify-week1-3-readiness.sh 2>/dev/null || true
  ROLL_TMP="$(mktemp -t readiness-roll.XXXXXX.json)"
  if scripts/rl-infra/roll/verify-week1-3-readiness.sh "$ROLL_TMP"; then
    roll_exit=0
  else
    roll_exit=1
  fi
  rm -f "$ROLL_TMP"
fi

ao_p0=0
npm run test:ao-p0 || ao_p0=1

decision_os=0
npm run test:decision-os:unit || decision_os=1

td_p0=0
if [ "${READINESS_P1_SKIP_TD_REPLAY:-}" = "1" ]; then
  echo "readiness:p1 — SKIP test:td-replay → npm run test:td-p0-core only (READINESS_P1_SKIP_TD_REPLAY=1)"
  npm run test:td-p0-core || td_p0=1
else
  npm run test:td-p0 || td_p0=1
fi

ao_p1=0
npm run test:ao-p1-contract || ao_p1=1

execution_os_stability=0
execution_os_stability_skipped="false"
if [ "${READINESS_P1_SKIP_EXECUTION_OS_STABILITY:-}" = "1" ]; then
  execution_os_stability_skipped="true"
  echo "readiness:p1 — SKIP ci:execution-os-stability (READINESS_P1_SKIP_EXECUTION_OS_STABILITY=1)"
else
  npm run ci:execution-os-stability || execution_os_stability=1
fi

cid_v1=0
cid_v1_skipped="false"
if [ "${READINESS_P1_SKIP_CID_V1:-}" = "1" ]; then
  cid_v1_skipped="true"
  echo "readiness:p1 — SKIP ci:cid-v1 (READINESS_P1_SKIP_CID_V1=1)"
else
  npm run ci:cid-v1 || cid_v1=1
fi

route_routing_gate=0
route_routing_gate_skipped="false"
if [ "${READINESS_P1_SKIP_ROUTE_ROUTING_GATE:-}" = "1" ]; then
  route_routing_gate_skipped="true"
  echo "readiness:p1 — SKIP ci:route-and-run-routing (READINESS_P1_SKIP_ROUTE_ROUTING_GATE=1)"
else
  npm run ci:route-and-run-routing || route_routing_gate=1
fi

routing_classifier_eval=0
routing_classifier_eval_skipped="false"
if [ "${READINESS_P1_SKIP_ROUTING_CLASSIFIER_EVAL:-}" = "1" ]; then
  routing_classifier_eval_skipped="true"
  echo "readiness:p1 — SKIP ci:routing-classifier-eval (READINESS_P1_SKIP_ROUTING_CLASSIFIER_EVAL=1)"
else
  npm run ci:routing-classifier-eval || routing_classifier_eval=1
fi

overall=0
if [ "$lint_skipped" = "false" ] && [ "$lint" -ne 0 ]; then
  overall=1
fi
if [ "$skills_audit" -ne 0 ]; then
  overall=1
fi
if [ "$physical_island" -ne 0 ]; then
  overall=1
fi
if [ "$physics_kernel" -ne 0 ]; then
  overall=1
fi
if [ "${READINESS_P1_SKIP_TYPECHECK_TRIPS:-}" != "1" ] && [ "$typecheck_trips" -ne 0 ]; then
  overall=1
fi
if [ "$build" -ne 0 ] || [ "$ao_p0" -ne 0 ] || [ "$decision_os" -ne 0 ] || [ "$td_p0" -ne 0 ] || [ "$ao_p1" -ne 0 ]; then
  overall=1
fi
if [ "$execution_os_stability_skipped" != "true" ] && [ "$execution_os_stability" -ne 0 ]; then
  overall=1
fi
if [ "$cid_v1_skipped" != "true" ] && [ "$cid_v1" -ne 0 ]; then
  overall=1
fi
if [ "$route_routing_gate_skipped" != "true" ] && [ "$route_routing_gate" -ne 0 ]; then
  overall=1
fi
if [ "$routing_classifier_eval_skipped" != "true" ] && [ "$routing_classifier_eval" -ne 0 ]; then
  overall=1
fi
if [ "$roll_skipped" = "false" ] && [ "$roll_exit" = "1" ]; then
  overall=1
fi

ok_json="false"
[ "$overall" -eq 0 ] && ok_json="true"

if [ "$lint_skipped" = "true" ]; then
  lint_block='"lint": { "skipped": true, "exitCode": null }'
else
  lint_block='"lint": { "skipped": false, "exitCode": '"$lint"' }'
fi

if [ "$roll_skipped" = "true" ]; then
  roll_block='"roll_week1_3": { "skipped": true, "exitCode": null }'
else
  roll_block='"roll_week1_3": { "skipped": false, "exitCode": '"$roll_exit"' }'
fi

if [ "${READINESS_P1_SKIP_TYPECHECK_TRIPS:-}" = "1" ]; then
  typecheck_trips_block='"typecheck_trips": { "skipped": true, "exitCode": null }'
else
  typecheck_trips_block='"typecheck_trips": { "skipped": false, "exitCode": '"$typecheck_trips"' }'
fi

# test_td_replay：兼容旧消费方（skipped + exitCode）；回放已并入 test:td-p0 时 exitCode 与 suites.test_td_p0 一致
if [ "${READINESS_P1_SKIP_TD_REPLAY:-}" = "1" ]; then
  td_replay_block='"test_td_replay": { "skipped": true, "exitCode": null, "note": "READINESS_P1_SKIP_TD_REPLAY=1 (test:td-p0-core only; test:td-replay not run)" }'
else
  td_replay_block='"test_td_replay": { "skipped": false, "exitCode": '"$td_p0"', "note": "included in suites.test_td_p0 (npm run test:td-p0); exitCode mirrors test_td_p0" }'
fi

if [ "$execution_os_stability_skipped" = "true" ]; then
  execution_os_block='"ci_execution_os_stability": { "skipped": true, "exitCode": null }'
else
  execution_os_block='"ci_execution_os_stability": { "skipped": false, "exitCode": '"$execution_os_stability"' }'
fi

if [ "$cid_v1_skipped" = "true" ]; then
  cid_block='"ci_cid_v1": { "skipped": true, "exitCode": null }'
else
  cid_block='"ci_cid_v1": { "skipped": false, "exitCode": '"$cid_v1"' }'
fi

if [ "$route_routing_gate_skipped" = "true" ]; then
  route_routing_block='"ci_route_and_run_routing": { "skipped": true, "exitCode": null }'
else
  route_routing_block='"ci_route_and_run_routing": { "skipped": false, "exitCode": '"$route_routing_gate"' }'
fi

if [ "$routing_classifier_eval_skipped" = "true" ]; then
  routing_classifier_block='"ci_routing_classifier_eval": { "skipped": true, "exitCode": null }'
else
  routing_classifier_block='"ci_routing_classifier_eval": { "skipped": false, "exitCode": '"$routing_classifier_eval"' }'
fi

printf '%s\n' "{
  \"schema\": \"readiness-p1/v2\",
  \"timestamp\": \"$TS\",
  \"repo\": {
    \"gitSha\": \"$GIT_SHA\",
    \"gitShaShort\": \"$GIT_SHORT\"
  },
  \"suites\": {
    $lint_block,
    \"skills_audit_descriptions\": { \"exitCode\": $skills_audit },
    \"check_physical\": { \"exitCode\": $physical_island },
    \"typecheck_physics\": { \"exitCode\": $physics_kernel },
    $typecheck_trips_block,
    \"build\": { \"exitCode\": $build },
    $roll_block,
    \"test_ao_p0\": { \"exitCode\": $ao_p0 },
    \"test_decision_os_unit\": { \"exitCode\": $decision_os },
    \"test_td_p0\": { \"exitCode\": $td_p0 },
    $td_replay_block,
    \"test_ao_p1_contract\": { \"exitCode\": $ao_p1 },
    $execution_os_block,
    $cid_block,
    $route_routing_block,
    $routing_classifier_block
  },
  \"related\": {
    \"rollWorkflow\": \".github/workflows/roll-readiness-check.yml\"
  },
  \"ok\": $ok_json
}" >"$REPORT"

if [ "${READINESS_P1_SKIP_PRESSURE:-}" = "1" ]; then
  echo "readiness:p1 — SKIP pressure merge (READINESS_P1_SKIP_PRESSURE=1)"
else
  npx tsx scripts/ci/compute-system-pressure.ts --merge "$REPORT" || true
fi

echo "readiness:p1 — report: $REPORT (ok=$ok_json)"
exit "$overall"
