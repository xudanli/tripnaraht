# 运维与架构说明：PA V2 分层上下文记忆落地 (P0)

## 1. 变更背景

此前 `PlanningAssistantService` 的会话多轮历史（`messageHistory`）完全存储在 NestJS 进程内 `Map` 中。这导致在 K8s 多实例部署或 Pod 重启时，用户遭遇「失忆」；且调用底层决策引擎（`route_and_run`）时处于上下文「半盲」状态（仅当前 `message` + `trip_id`）。

本变更将 PA 会话状态下沉至 Redis，并打通向 Decision OS 输送聊天滑动窗口的链路。

**相关代码**

| 组件 | 路径 |
|------|------|
| Redis 会话存储 | `src/agent/assistants/planning-assistant/services/pa-conversation-context.service.ts` |
| PA 服务读写 | `src/agent/assistants/planning-assistant/services/planning-assistant.service.ts` |
| `route_and_run` 桥接 | `src/agent/assistants/planning-assistant/services/planning-assistant-v2.service.ts` → `buildRouteAndRunRequestForPaGenerate` |
| 滑动窗口格式化 | `src/agent/assistants/planning-assistant/utils/pa-bridge.util.ts` |

## 2. 数据流与存储架构

- **存储介质：** Redis（主）+ 各 Pod 内存 Map（热缓存，与 NL 对话上下文模式一致）
- **Redis Key：** `pa_conversation:{sessionId}`（`sessionId` 为前端/创建会话接口返回的全局 UUID）
- **TTL：** 24 小时；每次 `saveSession` / `PaConversationContextService.set` 刷写 TTL
- **多租户：** `get(sessionId, userId?)` 时若传入 `userId` 且与 `state.userId` 不一致，返回 `null`（防串会话）
- **清空：**
  - `DELETE /api/agent/planning-assistant/v2/sessions/:sessionId` → 删除 Redis `pa_conversation:*` 及 V2 元数据缓存 `session:{sessionId}`

**与 Decision OS 记忆的分工**

| 类型 | 存储 | 内容 |
|------|------|------|
| 聊天气泡 | `pa_conversation:*` | `messageHistory`、phase、preferences |
| 决策状态 | `trip_task_memory:*`、`agent:mem_snapshot:v1:*` | 阶段、约束、账本快照（**不含**完整 chat transcript） |

## 3. 桥接控制（Sliding Window）

在触发方案生成（Sync `routeAndRun` / Async C1 `routeAndRunAsync`）时：

- 从 `getSessionState(sessionId)` 读取 `messageHistory`
- 取最近 **10 条** `user` / `assistant` 消息，格式化为 `用户: …` / `助手: …`
- 写入 `RouteAndRunRequestDto.conversation_context.recent_messages`
- 若提供 `trip_id`，同时设置 `context_type: active_trip_summary`（供 enricher 注入行程摘要）
- **`excludeTrailingUserContent`：** 若历史末尾 user 内容与当前 `message` 相同，则排除该条，避免与单轮 `message` 重复

下游消费者（意图编译、Claude 编排等）仍按各自 `slice(-N)` 裁剪；P1 见 **[context-sliding-window-adapter-p1.md](./context-sliding-window-adapter-p1.md)**。

## 4. Staging 验收清单

1. **多 Pod：** Pod A 多轮 `POST .../chat` → Pod B `GET .../sessions/:id/history` 历史一致（需 Redis，`DISABLE_REDIS` 未开启）
2. **编排可见历史：** 触发方案生成后，检查 `route_and_run` 请求体 `conversation_context.recent_messages.length > 0`
3. **删除会话：** `DELETE` 后 `redis-cli GET pa_conversation:<sessionId>` 为空
4. **重启：** 重启 Nest 后同 `sessionId` 仍可恢复（Redis 开启时）

## 5. 运维命令

```bash
# 列出 PA 会话键
redis-cli keys "pa_conversation:*"

# 查看单会话 JSON（替换 <session-uuid>）
redis-cli get "pa_conversation:<session-uuid>"

# 决策回放快照（编排侧实际消费的 memory 视图）
redis-cli keys "agent:mem_snapshot:v1:*"
```

## 6. 环境变量

| 变量 | 说明 |
|------|------|
| `DISABLE_REDIS=true` | 仅内存；多 Pod / 重启会失忆（dev/MCP） |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | 与全局 CacheModule 一致 |

## 7. 排障

| 现象 | 优先检查 |
|------|----------|
| 刷新页面后对话丢失 | Redis 是否连通；key 是否存在 |
| 编排「听不懂」上文 | 请求是否带 `sessionId`；`recent_messages` 是否为空 |
| 多 Pod 状态不一致 | 是否误用仅内存模式；两 Pod 是否连同一 Redis DB |

**日志：** `[PaConversationContextService]`、`[PlanningAssistantService]`、`[PlanningAssistantV2Service]` 方案 A / C1 `route_and_run` debug 行。
