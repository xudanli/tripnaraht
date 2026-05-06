#!/usr/bin/env bash
# P1 发布前聚合门禁：lint → check:physical（逻辑孤岛 / 替代全仓 typecheck:src）→ build → ROLL Week1-3 文件校验（可跳过）→ AO P0 → Decision OS unit（normalize / traceability / LangGraph PRD / task memory）→ TD P0（含 TD-05 test:td-replay）→ AO P1 合同
# 输出 JSON 报告（默认 ./readiness-p1-report.json，schema readiness-p1/v2）
# 环境变量：
#   READINESS_P1_REPORT — 报告输出路径
#   READINESS_P1_SKIP_ROLL=1 — 跳过 ROLL Week1-3 文件校验
#   READINESS_P1_SKIP_LINT=1 — 跳过 eslint（仅本地应急；CI 不应设置）
#   READINESS_P1_SKIP_TD_REPLAY=1 — 仅跑 test:td-p0-core，跳过 npm run test:td-replay（TD-05；仅本地应急）

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
if [ "${READINESS_P1_SKIP_LINT:-}" = "1" ]; then
  lint_skipped="true"
  echo "readiness:p1 — SKIP lint (READINESS_P1_SKIP_LINT=1)"
else
  npm run lint || lint=1
fi

physical_island=0
npm run check:physical || physical_island=1

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

overall=0
if [ "$lint_skipped" = "false" ] && [ "$lint" -ne 0 ]; then
  overall=1
fi
if [ "$physical_island" -ne 0 ]; then
  overall=1
fi
if [ "$build" -ne 0 ] || [ "$ao_p0" -ne 0 ] || [ "$decision_os" -ne 0 ] || [ "$td_p0" -ne 0 ] || [ "$ao_p1" -ne 0 ]; then
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

# test_td_replay：兼容旧消费方（skipped + exitCode）；回放已并入 test:td-p0 时 exitCode 与 suites.test_td_p0 一致
if [ "${READINESS_P1_SKIP_TD_REPLAY:-}" = "1" ]; then
  td_replay_block='"test_td_replay": { "skipped": true, "exitCode": null, "note": "READINESS_P1_SKIP_TD_REPLAY=1 (test:td-p0-core only; test:td-replay not run)" }'
else
  td_replay_block='"test_td_replay": { "skipped": false, "exitCode": '"$td_p0"', "note": "included in suites.test_td_p0 (npm run test:td-p0); exitCode mirrors test_td_p0" }'
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
    \"check_physical\": { \"exitCode\": $physical_island },
    \"build\": { \"exitCode\": $build },
    $roll_block,
    \"test_ao_p0\": { \"exitCode\": $ao_p0 },
    \"test_decision_os_unit\": { \"exitCode\": $decision_os },
    \"test_td_p0\": { \"exitCode\": $td_p0 },
    $td_replay_block,
    \"test_ao_p1_contract\": { \"exitCode\": $ao_p1 }
  },
  \"related\": {
    \"rollWorkflow\": \".github/workflows/roll-readiness-check.yml\"
  },
  \"ok\": $ok_json
}" >"$REPORT"

echo "readiness:p1 — report: $REPORT (ok=$ok_json)"
exit "$overall"
