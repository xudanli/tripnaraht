# TripNARA CLI 命令使用文档

本文档基于当前 `tripnara-cli/src/commands` 实现整理。

## 快速查看帮助

- 查看总览：
  - `npm run dev -- --help`
- 查看某个命令：
  - `npm run dev -- plan --help`
  - `npm run dev -- harness --help`

---

## 1) `plan` 行程生成

用于按自然语言生成行程；支持本地模式和 API 模式。

### 基本用法

```bash
npm run dev -- plan "明天在东京的一日行程"
```

### API 模式

```bash
npm run dev -- plan "明天在东京的一日行程" \
  --api \
  --api-base http://localhost:3000 \
  --user-id u1 \
  --trip-id <trip-id>
```

### 参数

- `<query>`：必填，用户自然语言需求
- `--days <days>`：本地模式天数，默认 `2`
- `--risk-score <score>`：本地模式风险提示 `0..1`
- `--api`：启用 API 模式
- `--api-base <url>`：后端地址（或环境变量 `TRIPNARA_API_BASE`）
- `--token <token>`：Bearer Token（或环境变量 `TRIPNARA_API_TOKEN`）
- `--user-id <id>`：API 模式用户 ID，默认 `cli-user`
- `--trip-id <id>`：API 模式 trip ID
- `--max-seconds <n>`：服务端 max_seconds，默认 `60`（会被限制在 `1..120`）
- `--strategy <name>`：fallback 策略提示  
  可选：`CITY_WALK | CLASSIC | HOT_SPOTS | BALANCED`
- `--show-debug-scores`：输出 fallback 候选打分明细（按 slot/type 分组 Top3）
- `--show-commute-matrix`：输出 fallback 通勤矩阵（起点→POI、POI→POI 估算分钟）
- `--interactive`：当返回澄清问题时，在终端选择选项并自动二次请求（最多 2 轮）
- `--require-poi-data`：强制要求命中 POI 数据；若 POI 为空则澄清，不走具名 fallback
- `--debug`：输出调试日志

---

## 2) `policy` 策略推断

用于演示风险分数下的策略推断；支持 API 模式和本地模式。

### 示例

```bash
npm run dev -- policy --risk-score 0.65
```

```bash
npm run dev -- policy --risk-score 0.65 \
  --api --api-base http://localhost:3000 --user-id u1 --trip-id <trip-id>
```

### 参数

- `--risk-score <score>`：必填，`0..1`
- `--api` / `--api-base` / `--token` / `--user-id` / `--trip-id` / `--max-seconds`
- `--query <text>`：API 模式下自定义 message

---

## 3) `simulate` 场景模拟

批量模拟多个 scenario，比较输出结果。

### 示例

```bash
npm run dev -- simulate "东京一日游" --scenarios 3
```

```bash
npm run dev -- simulate "东京一日游" --scenarios 3 \
  --api --api-base http://localhost:3000 --user-id u1
```

### 参数

- `<query>`：必填
- `--scenarios <n>`：场景数量，默认 `3`
- API 相关参数同 `plan`

---

## 4) `explain` 决策解释（本地）

按风险分数输出 kernel 解释结果。

### 示例

```bash
npm run dev -- explain --risk-score 0.4
```

### 参数

- `--risk-score <score>`：必填，`0..1`

---

## 5) `run-agent` 运行 DSL 文件

读取并执行 DSL JSON 文件。

### 示例

```bash
npm run dev -- run-agent ./examples/agent.dsl.json
```

### 参数

- `<file>`：DSL 文件路径

---

## 6) `run-route-and-run` 直接调用 route_and_run API

偏“接口调试”风格，支持 json/table 输出和 debug trace。

### 示例

```bash
npm run dev -- run-route-and-run \
  --api-base http://localhost:3000 \
  --user-id u1 \
  --query "明天在东京的一日行程" \
  --trip-id <trip-id> \
  --format table \
  --debug
```

### 关键参数

- `--api-base <url>`：必填
- `--user-id <id>`：必填
- `--query <text>`：必填
- `--token <token>` / `--trip-id <id>` / `--request-id <id>`
- `--days <n>` / `--max-seconds <n>`
- `--format <json|table>`：默认 `json`
- `--top-risks <n>` / `--min-risk-count <n>`：table debug 风险展示
- `--color` / `--no-color`
- `--debug`：打印 decision_steps/policy_path/confidence
- `--raw`：打印完整 raw 响应

---

## 7) `route_and_run`（C1 烟测命令）

用于 C1 检查（健康检查 + route_and_run 结果）。

### 示例

```bash
npm run dev -- route_and_run \
  --case basic \
  --api-base http://localhost:3000 \
  --user-id harness-user \
  --trip-id <trip-id> \
  --verbose
```

### 关键参数

- `--case <name>`：必填，cases 文件名（不带 `.json`）
- `--env <name>`：环境标签，默认 `staging`
- `--auth <token>`：token（也可用环境变量）
- `--api-base <url>`
- `--case-id <id>`：指定 case id（默认取第一个）
- `--user-id` / `--trip-id` / `--max-seconds`
- `--full-run`：`dry_run=false`
- `--write-artifact <path>`：输出 artifact
- `--verbose`：失败时输出详细诊断
- `--soft`：将 `NEED_MORE_INFO + CLARIFY` 视为通过

---

## 8) `harness` 回归评测

`harness` 下有 3 个子命令：`run` / `replay` / `ab`。

### 8.1 `harness run`

```bash
npm run dev -- harness run cases/basic.json --api --api-base http://localhost:3000
```

参数：
- `<file>`：cases JSON 文件
- `--verbose`
- `--api` / `--api-base` / `--user-id` / `--trip-id` / `--token` / `--max-seconds`

### 8.2 `harness replay`

```bash
npm run dev -- harness replay --case-id case_1 --file cases/basic.json --api --api-base http://localhost:3000
```

参数：
- `--case-id <id>`：必填
- `--file <path>`：默认 `cases/basic.json`
- 其余 API 参数同上

### 8.3 `harness ab`

```bash
npm run dev -- harness ab cases/basic.json --variant local --variant api --api-base http://localhost:3000
```

参数：
- `<file>`：cases JSON
- `--variant <name>`：可重复传，通常两次（A/B）
- `--api-base` / `--user-id` / `--trip-id` / `--token` / `--max-seconds`

---

## 环境变量（常用）

- `TRIPNARA_API_BASE`：API 基地址
- `TRIPNARA_API_TOKEN`：API token
- `API_BASE` / `AUTH_TOKEN`：部分命令也会读取

---

## 常见组合命令

### 真实 API 规划（严格要求库内 POI）

```bash
npm run dev -- plan "明天在东京的一日行程" \
  --api --api-base http://localhost:3000 --user-id u1 --trip-id <trip-id> \
  --require-poi-data
```

### 真实 API 规划 + 打分明细

```bash
npm run dev -- plan "明天在东京的一日行程" \
  --api --api-base http://localhost:3000 --user-id u1 --trip-id <trip-id> \
  --show-debug-scores
```
