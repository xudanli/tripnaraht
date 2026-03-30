# TripNARA CLI

面向 TripNARA 决策与编排能力的 **Node + TypeScript** 命令行工具。本目录为独立子工程（`tripnara-cli/`），通过 HTTP 调用主仓库 Nest API；本地 mock 命令用于演示决策内核与 DSL，不依赖后端。

## 与主项目的关系

- 主 API 需单独启动（仓库根目录例如 `npm run dev`），默认 `http://localhost:3000`。
- 真实编排入口：`POST /api/agent/route_and_run`（路径为 **`route_and_run`**，下划线）。
- CLI 未包含 Nest 业务代码；**生产逻辑在主仓库**，CLI 负责调用与展示。

## 快速开始

```bash
cd tripnara-cli
npm install
npm run dev plan "上海美食2天" --days 2
```

构建与全局入口（可选）：

```bash
npm run build
npm run start -- plan "hello"
# 或 npm link 后使用 bin 名 tripnara（见 package.json "bin"）
```

## 命令一览

| 命令 | 说明 |
|------|------|
| `plan <query> --days <n>` | 本地 mock：行程 + 决策内核演示 |
| `policy --risk-score <0-1>` | mock Policy |
| `simulate <query> --scenarios <n>` | 多场景策略模拟 |
| `explain --risk-score <0-1>` | 简要 verdict 追踪 |
| `run-agent <dsl-file>` | 读取 DSL（JSON），经解析校验后执行 agent 注册表 |
| `run-route-and-run` | **对接主后端** `route_and_run`，解析 verdict / gate / 风险摘要 / 失败与超时等 |
| **`route_and_run`** | **C1 准生产**：`GET /health` + 一次 `route_and_run`（`cases/<case>.json`），可写 `artifacts/e2e_run_log.json` |
| **`harness`** | **评测集**：对 verdict / 风险代理分做断言（本地 Planner 或 API） |

## `harness`（评测）

对 `cases/*.json` 中的用例逐条执行，比较 **expected.verdict**（必选）与可选 **maxRisk** 上限。

```bash
# 默认：本地 Planner + DecisionKernel（无需后端）
npm run dev -- harness run cases/basic.json

npm run dev -- harness run cases/basic.json --verbose

# 回放单条
npm run dev -- harness replay --case-id case_1 --file cases/basic.json

# A/B：本地 vs 线上（需 API；`A`≈local，`B`≈api）
npm run dev -- harness ab cases/basic.json --variant A --variant B \
  --api-base http://localhost:3000
```

- **`harness run`**：`--api` 时走 `route_and_run`（需 `--api-base` 或 `TRIPNARA_API_BASE`）。
- **`harness replay`**：单条重跑，便于调试失败用例。
- **`harness ab`**：两套 variant 各跑全集并输出对比；未传 `--variant` 时默认 `local` + `api`；`api` 需 `--api-base`。

### Case 协议（`cases/basic.json`）

见仓库内示例。支持字段：`id`、`query`、`expected.verdict`、`expected.maxRisk`（可选）、`riskScoreHint` / `days` / `reason` / `expectedRisk`（可选扩展）。

## `route_and_run`（C1：health + 单次编排）

用于 **staging / 准生产** 最小闭环（非 mock），并生成 **`release-gate:v2`** 所需的 `e2e_run_log.json` 字段。

```bash
cd tripnara-cli
export API_BASE=https://staging.example.com
export AUTH_TOKEN=<token>

npm run dev -- route_and_run --case basic --env staging --auth "$AUTH_TOKEN" \
  --write-artifact ../artifacts/e2e_run_log.json
```

- **API 基址**：`API_BASE` 或 `TRIPNARA_API_BASE`，或 `--api-base`。
- **鉴权**：`AUTH_TOKEN` / `TRIPNARA_API_TOKEN`，或 `--auth`。
- **用例**：`--case basic` → `cases/basic.json`；默认跑**第一条**；`--case-id case_1` 指定条目。
- **`--full-run`**：`dry_run=false`（更重 downstream，慎用）。
- **`--soft`**：把 **`NEED_MORE_INFO` + `verdict: CLARIFY`** 也视为 **`run_status: SUCCESS`**（编排正常但要补信息）；artifact 可能带 **`c1_soft_pass: true`**。准生产签字仍以 **`result.status === OK`** 为准时可**不加** `--soft`。

详见仓库根目录 `docs/testing/C1_QUASI_PROD_E2E.md`。

## `run-route-and-run`（后端接入）

### 必填与常用参数

- **必填**：`--api-base`、`--user-id`、`--query`
- **常用**：`--trip-id`、`--token`、`--request-id`、`--days`
- **`--max-seconds <1-20>`**（默认 **20**）：对应请求体 `options.max_seconds`。主服务对编排 deadline 有上限（默认约 12s、封顶约 20s），显式传 **20** 可减少无意的 **TIMEOUT**。
- **输出**：`--format json|table`（默认 `json`）、`--debug`、`--raw`（打印完整响应 JSON）
- **表格**：`--top-risks`、`--min-risk-count`、`--color` / `--no-color`
- **网络**：连接失败时若底层为 `ECONNREFUSED`，错误信息会提示检查服务是否已启动。

### 环境变量（可选）

在 `tripnara-cli/.env` 或环境中设置（由 `dotenv` 加载）：

- `TRIPNARA_API_BASE`：默认 API 根 URL（命令行 `--api-base` 优先）
- `TRIPNARA_API_TOKEN`：Bearer token（可用 `--token` 覆盖）

### 示例

```bash
npm run dev -- run-route-and-run \
  --api-base http://localhost:3000 \
  --user-id u1 \
  --trip-id trip-001 \
  --query "上海美食2天" \
  --max-seconds 20
```

表格 + 调试信息：

```bash
npm run dev -- run-route-and-run \
  --api-base http://localhost:3000 \
  --user-id u1 \
  --query "上海美食2天" \
  --trip-id trip-001 \
  --format table \
  --top-risks 5 \
  --min-risk-count 2 \
  --color \
  --debug
```

## 工程结构（概要）

- `src/commands/`：子命令实现（含 `harness`）
- `src/harness/`：评测 runner / evaluator / reporter / loader / API 映射
- `cases/`：示例用例 JSON（如 `basic.json`）
- `src/core/`：`api-client`、`kernel`、`planner`、`policy` 及 mock 逻辑
- `src/dsl/`：Zod schema、parser、runner
- `src/agents/`、`src/context/`、`src/types/`：DSL 演示与类型
- `src/infra/`：配置、`CliError`、日志
- `dsl/`、`examples/`：示例 DSL 与样例 JSON

## 测试

```bash
npm test
```

使用 `npx tsx --test` 运行 `src/**/*.test.ts`（如 `api-client`、`config`）。

## 完成度与后续可做

**已有**：命令骨架、DSL 解析与执行、mock 决策链、**`run-route-and-run` 与主 API 对齐的解析**（含 `result_status`、`answer_text`、`orchestration_errors`、gate 双路径等）、错误码与 env、基础单测。

**未强依赖 / 待扩展**：HTTP 层 `--timeout` / `--retries`、表格输出的快照契约测试、发布与版本流程；真实 LLM/Policy 仍在主服务侧。

## 备注

- 依赖中的 `chalk` / `ora` 可能因 CJS/ESM 与 `ts-node` 组合未在全部路径启用；当前以控制台输出为主。
- 若出现 `NETWORK_ERROR`，请先确认主服务已监听且 `--api-base` 与端口一致。
