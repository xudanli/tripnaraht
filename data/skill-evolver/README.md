# SkillEvolver Lite 数据目录

Markdown 文本技能与进化轨迹存储（与 `src/skills/*.skill.ts` 可执行技能分离）。

| 目录 | 说明 |
|------|------|
| `current/` | markdown_skill 当前版本 |
| `artifacts/country-pack/current/` | country_pack 当前版本（如 `IS.md`） |
| `versions/` | 历史版本 |
| `trajectories/` | 执行轨迹 JSON |
| `replay-cases/` | 与 TD E2E 对齐的 fixture（含 `source_e2e_case_id`） |
| `seeds/` | 演示用弱种子（`--seed weak`） |
| `agent-skills-export/` | agentskills.io 导出 |

设计文档：`docs/skill-evolver-lite-design.md`

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `SKILL_EVOLVER_BASE_PATH` | `data/skill-evolver` | 数据根目录 |
| `SKILL_EVOLVER_USE_DECISION_REPLAY` | 开启 | 有 E2E source id 时用 `decision_replay` |
| `SKILL_EVOLVER_LIVE_DECISION_REPLAY` | 关 | 真实 `TripDecisionEngineService`（较慢；评分以 skill 断言为主） |
| `SKILL_EVOLVER_INJECT_COUNTRY_PACK` | 关 | `IS` / `true`：开发时从文件注入 Markdown（覆盖 DB） |
| `SKILL_EVOLVER_VERBOSE` | 关 | 等同 CLI `--verbose` |

## CLI 常用命令

```bash
# 生产进化（decision_replay + fixture mock，快）
npm run skill-evolver:pipeline -- \
  --skill country_pack.IS \
  --replay-case iceland-highlands-dem-missing \
  --max-rounds 2

# 真实决策引擎回放（慢，需更多 CPU）
SKILL_EVOLVER_LIVE_DECISION_REPLAY=true npm run skill-evolver:pipeline -- \
  --skill country_pack.IS \
  --replay-case iceland-highlands-dem-missing \
  --live --verbose

# 演示：弱种子 → 进化 → 写 v2 → 同步 ReadinessPack DB
npm run skill-evolver:pipeline -- \
  --skill country_pack.IS \
  --replay-case iceland-highlands-dem-missing \
  --seed weak

# 仅同步进化 Markdown 到 DB（需 DATABASE_URL）
npm run skill-evolver:sync-readiness -- --country IS

# 关闭 decision replay，仅用 fixture 断言
npm run skill-evolver:pipeline -- \
  --skill country_pack.IS \
  --replay-case iceland-highlands-dem-missing \
  --no-decision-replay --eval fixture
```

## 运行时 Agent

1. **DB（生产）**：pipeline 成功后会 `sync-readiness`，`countryPack.getBlocks` 读取 `packData.skillEvolver.markdown`
2. **文件（开发）**：`export SKILL_EVOLVER_INJECT_COUNTRY_PACK=IS` 优先使用 `artifacts/country-pack/current/IS.md`

### Agent 联调

**层 1 — `countryPack.getBlocks`（推荐先跑）**

```bash
npm run agent:country-pack-evolver-smoke
```

通过即表示进化 Markdown 已进入 Agent 上下文块（DB `readiness_pack` + 可选文件注入）。

**层 2 — 全链路 `route_and_run`（需 Nest + 有效行程）**

```bash
# 终端 1（已自动同步 E2E JSON 到 dist，避免 ENOENT）
npm run dev

# 终端 2（冰岛行程示例，来自本库 staging）
export TRIP_ID=b950dbf2-7583-4b43-b0c6-ddd947719c54
export USER_ID=5872f534-4fdf-483d-9e5a-464d3f36935d
npm run agent:skill-evolver-route-and-run-smoke
```

编排 `status=OK` 且回答含 DEM/拒绝 语义即通过（HTTP 响应一般不包含 ContextBlock 原文）。  
块级注入以层 1 为准。若 `MISSING_TRIP_ID`，检查 `TRIP_ID` / `USER_ID` 是否为行程协作者。

## HTTP API（需 `npm run dev`）

`POST /training/skill-evolver/pipeline`

```json
{
  "skill_id": "country_pack.IS",
  "replay_case_id": "iceland-highlands-dem-missing",
  "live_decision_replay": true,
  "sync_readiness_pack": true,
  "verbose": true,
  "max_rounds": 2
}
```
