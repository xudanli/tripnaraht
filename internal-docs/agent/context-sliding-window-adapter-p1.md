# P1 设计：ContextSlidingWindowAdapter

> **前置：** [pa-context-memory-p0.md](./pa-context-memory-p0.md) 已将 PA 多轮历史桥接到 `conversation_context.recent_messages`（默认最多 10 条）。P1 解决**下游消费端**硬编码 `slice(-N)` 漂移问题。

## 1. 目标与非目标

### 目标

- 消灭 `route_and_run` 链路内对 `recent_messages` 的散落 `slice(-3/-5/-6/-16)`。
- 用 **Consumer Profile** 集中配置「谁消费、看几条」。
- 上游可传入完整窗口（如 PA 10 条、未来入口 50 条），各 Token 敏感节点通过适配器**自律裁剪**，避免超窗与资费失控。

### 非目标（本 PR 不做）

| 项 | 说明 |
|----|------|
| PA `messageHistory` → prompt | `planning-assistant.service.ts` 意图分析仍用 `messageHistory.slice(-3)`，数据源不同，可后续单独 profile |
| `trip-planner` / NL trips 对话 | 自有 `history.slice(-5)`，不走 `conversation_context` |
| Enricher **前置**注入 | `route-and-run-context-enricher` / `decision-os-execution-context` 在数组**头部**拼摘要，应保持全量传入后再由消费者 slice |
| `format` 多形态输出 | 首版仅 `string[]`；`object_array` 预留接口，不实现 |

## 2. 核心设计

### 2.1 Profile 定义

```typescript
// src/agent/context/interfaces/context-window-profile.interface.ts

export type ContextConsumerProfile =
  | 'intent_compiler'
  | 'agent_telemetry'
  | 'orchestrator_claude'
  | 'repair_executor'
  | 'request_dedup'
  | 'default';

export interface ProfileConfig {
  /** 滑动窗口条数（取 recent_messages 尾部 N 条） */
  limit: number;
  /** 预留：string_array | object_array */
  format?: 'string_array';
}

export const CONTEXT_PROFILES: Record<ContextConsumerProfile, ProfileConfig> = {
  intent_compiler: { limit: 3 },
  agent_telemetry: { limit: 6 },
  orchestrator_claude: { limit: 16 },
  repair_executor: { limit: 5 },
  request_dedup: { limit: 3 },
  default: { limit: 10 },
} as const;
```

### 2.2 适配器

```typescript
// src/agent/context/services/context-sliding-window-adapter.service.ts

@Injectable()
export class ContextSlidingWindowAdapter {
  slice(profile: ContextConsumerProfile, messages: readonly string[] | undefined | null): string[];

  /** 可选：过滤非 string、trim 空行后再 slice */
  sliceSafe(profile: ContextConsumerProfile, messages: unknown[] | undefined | null): string[];
}
```

**行为约定**

1. `null` / `undefined` / `[]` → `[]`
2. `sliceSafe`：`typeof m === 'string'` 且 `trim()` 非空
3. 始终 `messages.slice(-config.limit)`（与今日行为一致，不改变顺序）
4. `debug` 日志：`profile`、`originalSize`、`slicedSize`、`limit`（可用 `DEBUG_CONTEXT_WINDOW=1` 门控）

### 2.3 模块注册

- 新建 `src/agent/context/context-window.module.ts`（或并入 `AgentModule` providers）
- `exports: [ContextSlidingWindowAdapter]`
- `AgentModule` import 后，各 consumer 注入使用

## 3. 迁移清单（P1 PR 必改）

| Profile | 当前 limit | 文件 | 行级行为 |
|---------|------------|------|----------|
| `intent_compiler` | 3 | `src/agent/runtime/llm-intent-compiler.service.ts` | `recent_messages?.slice(-3)` |
| `agent_telemetry` | 6 | `src/agent/services/agent.service.ts` | 遥测 payload `recent_messages?.slice(-6)` |
| `orchestrator_claude` | 16 | `src/agent/services/claude-orchestrator.service.ts` | 两处 `slice(-16)`（~7024, ~7579） |
| `repair_executor` | 5 | `src/agent/execution/repair-executor.service.ts` | filter string 后 `slice(-5)` |
| `request_dedup` | 3 | `src/agent/services/request-deduplication.service.ts` | 去重指纹 `slice(-3)` |

### 3.1 迁移后需审计（可能补 profile 或显式 passthrough）

| 文件 | 现状 | P1 建议 |
|------|------|---------|
| `agent.service.ts` | 部分路径传**未裁剪** `recent_messages`（~1278, ~1598, ~1737） | 按调用场景选用 `agent_telemetry` 或 `default` |
| `claude-orchestrator.service.ts` | ~10808 传全量 `recentMessages` | 改为 `orchestrator_claude` |
| `research-phase.executor.ts` | 透传全量 | 若进入 LLM，用 `default` 或 `orchestrator_claude` |
| `verify-executor.service.ts` | 自有 filter，无 slice | 首版可不动 |

### 3.2 明确不改（本 PR）

- `src/agent/assistants/planning-assistant/utils/pa-bridge.util.ts`：`limit: 10` 是**上游桥接**，与 adapter `default` 对齐即可，不必再 slice 一次
- `orchestration-signals.util.ts`：仅 `recentCount` 统计，不裁剪

## 4. 消费端改法（模板）

```typescript
// Before
const recent = request.conversation_context?.recent_messages?.slice(-3) ?? [];

// After
const recent = this.contextSlidingWindow.slice('intent_compiler', request.conversation_context?.recent_messages);
```

```typescript
// Before (claude-orchestrator)
const recentSlice = (request.conversation_context?.recent_messages ?? []).slice(-16);

// After
const recentSlice = this.contextSlidingWindow.slice('orchestrator_claude', request.conversation_context?.recent_messages);
```

## 5. 测试策略

| 层级 | 内容 |
|------|------|
| 单元 | `context-sliding-window-adapter.service.spec.ts`：空输入、超长输入、profile fallback、`sliceSafe` 过滤 |
| 契约 | 各 profile limit 与 `CONTEXT_PROFILES` 快照一致（防无意改 limit） |
| 回归 | 现有 `llm-intent-compiler` / `route-and-run-context-enricher` 相关 spec 保持绿 |

## 6. 观测与运维

- Metric（可选 P1.1）：`context_window_slice_total{profile,original_bucket}` 
- 与 P0 联调：PA 注入 10 条 → `intent_compiler` 实际消费 3 条 → Claude 路径最多 16 条

## 7. PR 切分建议

```
PR-P1-a  适配器 + CONTEXT_PROFILES + 单测 + AgentModule 注册
PR-P1-b  迁移 5 个必改文件 + agent/claude 审计路径
```

若团队偏好单 PR，保持 **a+b 同一 PR**，但 commit 分两段便于 review。

## 8. 验收标准（Staging）

1. 同一 `route_and_run` 请求：日志中 `intent_compiler` sliced=3、`orchestrator` sliced≤16
2. 人为传入 20 条 `recent_messages`：各节点无超 profile limit 的 prompt 片段
3. P0 四项验收仍通过（PA Redis + 桥接不退化）

## 9. 后续（P1.1+）

- 环境变量覆盖 limit：`CONTEXT_WINDOW_INTENT_COMPILER_LIMIT=5`（仅 staging 调参）
- `object_array` 供多模态 / tool message 结构化历史
- PA 意图分析改用 `messageHistory` → adapter profile `pa_intent`（limit 3）

---

**状态：**

| 阶段 | 状态 |
|------|------|
| **P1-a** | ✅ `src/agent/context/` + `AgentContextModule` |
| **P1-b** | ✅ 5 处必改 + `agent.service` 编排/路由路径已接入 adapter |
