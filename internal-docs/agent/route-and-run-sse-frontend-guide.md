# 前端改造指南：`route_and_run` 异步编排 + SSE

配合 [route-and-run-sse-rollout.md](./route-and-run-sse-rollout.md) 使用。本仓库无前端工程，以下为 **API 契约驱动的集成说明**。

---

## 1. 你要改什么（一句话）

**长耗时规划**：从「只轮询 `task/status`」改为 **「`task/stream` SSE 实时进度 + 可选轮询兜底」**；同步 `route_and_run` 与请求体 **不变**。

---

## 2. 三种调用路径（选一种主路径）

| 路径 | 接口 | 何时用 |
|------|------|--------|
| **A. 同步（存量）** | `POST /api/agent/route_and_run` | 短请求、可接受长时间 loading |
| **B. 显式异步（推荐新 UI）** | `POST /api/agent/route_and_run/async` → SSE | 行程生成、长考决策 |
| **C. 同步入口 + 自动委托** | `POST /api/agent/route_and_run` + `options.async_mode: 'AUTO' \| 'FORCE'` | 已有统一入口，想少改 URL |

### B 推荐流程

```
1. POST /api/agent/route_and_run/async  (202)
   ← { task_id, current_phase, progress_percentage, message, request_id, ... }

2. GET  /api/agent/task/stream/{task_id}  (EventSource / fetch SSE)
   ← event: message  (多次 PHASE)
   ← event: message  (RESULT | ERROR)
   ← event: end

3. 用 RESULT.data 当作原 route_and_run 完整响应渲染
```

### C 流程（兼容旧代码）

同步 POST 若返回 **202** 且 body 含 `async_task`：

```json
{
  "async_task": {
    "task_id": "task_xxx",
    "poll_path": "/api/agent/task/status/task_xxx",
    "current_phase": "INTENT_COMPILE",
    "progress_percentage": 5,
    "message": "…",
    "is_async_delegated": true
  }
}
```

前端应：

1. 用 `async_task.task_id` 建 SSE（**不要**只依赖 `poll_path` 轮询）。
2. `poll_path` 保留作 **SSE 失败兜底**（间隔 2s）。

---

## 3. TypeScript 类型（建议复制到前端）

```typescript
/** SSE event: message 的 data JSON */
export type RouteAndRunTaskSsePayload = {
  task_id: string;
  request_id: string;
  type: 'PHASE' | 'RESULT' | 'ERROR';
  current_phase: string;       // INTENT_COMPILE | RESEARCH | PLAN_GEN | DONE | FAILED ...
  progress_percentage: number; // 0–100
  message: string;             // 中文进度文案，可直接展示
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  ts: string;
  error?: string;
  /** 仅 type === 'RESULT' */
  data?: RouteAndRunResponseDto | null;
};

/** POST .../async 202 */
export type RouteAndRunTaskInit = {
  task_id: string;
  status: 'PENDING' | 'PROCESSING';
  current_phase: string;
  progress_percentage: number;
  message: string;
  data: null;
  request_id: string;
};
```

`RouteAndRunResponseDto` 与现有同步 `route_and_run` 响应 **相同**（`result`、`route` 等字段不变）。

---

## 4. SSE 订阅（核心代码）

### 4.1 注意：鉴权与 EventSource

当前后端 `@Public()`，`EventSource` 可直接用。

**生产若加 JWT**：原生 `EventSource` **不能**带 `Authorization` 头，需二选一：

- Query：`/api/agent/task/stream/{id}?access_token=...`（需后端支持，当前未实现）
- 使用 **`fetch` + ReadableStream** 读 SSE（可带 Header）

下面示例按 **当前 Public API** 写；带 Token 时用 §4.3。

### 4.2 React Hook 示例（EventSource）

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function useRouteAndRunTaskStream(taskId: string | null) {
  const [progress, setProgress] = useState<RouteAndRunTaskSsePayload | null>(null);
  const [result, setResult] = useState<RouteAndRunResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!taskId) return;

    const url = `${API_BASE}/api/agent/task/stream/${encodeURIComponent(taskId)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('message', (ev) => {
      const payload = JSON.parse(ev.data) as RouteAndRunTaskSsePayload;
      setProgress(payload);

      if (payload.type === 'RESULT') {
        setResult(payload.data ?? null);
        setDone(true);
        es.close();
      } else if (payload.type === 'ERROR') {
        setError(payload.error ?? payload.message ?? '规划失败');
        setDone(true);
        es.close();
      }
    });

    es.addEventListener('end', () => {
      setDone(true);
      es.close();
    });

    es.onerror = () => {
      // 网络断开 / 502：交给外层 fallback 轮询，勿无限重连
      es.close();
      setError((e) => e ?? 'SSE 连接异常');
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [taskId]);

  return { progress, result, error, done };
}
```

### 4.3 带 Bearer Token 的 fetch SSE（生产推荐）

```typescript
export async function subscribeRouteAndRunTaskStream(
  taskId: string,
  accessToken: string,
  onPayload: (p: RouteAndRunTaskSsePayload) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/agent/task/stream/${taskId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'text/event-stream' },
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const block of parts) {
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      const json = dataLine.slice(6);
      if (json === '{}') continue; // event: end
      onPayload(JSON.parse(json));
    }
  }
}
```

---

## 5. 完整调用封装

```typescript
export async function runRouteAndRunWithStreaming(
  body: RouteAndRunRequestDto,
  handlers: {
    onProgress: (p: RouteAndRunTaskSsePayload) => void;
    onComplete: (response: RouteAndRunResponseDto) => void;
    onError: (message: string) => void;
  },
  options?: { accessToken?: string; preferPollingFallback?: boolean },
): Promise<void> {
  // 1. 启动异步任务
  const initRes = await fetch(`${API_BASE}/api/agent/route_and_run/async`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: JSON.stringify({
      ...body,
      options: {
        ...body.options,
        async_mode: body.options?.async_mode ?? 'FORCE', // 显式走异步时可 FORCE
      },
    }),
  });

  if (initRes.status !== 202 && initRes.status !== 200) {
    throw new Error(`async start failed: ${initRes.status}`);
  }

  const init = (await initRes.json()) as RouteAndRunTaskInit;
  const taskId = init.task_id;

  // 先展示首包进度（与 SSE 首条 PHASE 可能重复，按 task_id+phase 去重）
  handlers.onProgress({
    task_id: taskId,
    request_id: init.request_id,
    type: 'PHASE',
    current_phase: init.current_phase,
    progress_percentage: init.progress_percentage,
    message: init.message,
    status: 'PROCESSING',
    ts: new Date().toISOString(),
  });

  const ac = new AbortController();

  try {
    if (options?.accessToken) {
      await subscribeRouteAndRunTaskStream(
        taskId,
        options.accessToken,
        (p) => {
          handlers.onProgress(p);
          if (p.type === 'RESULT' && p.data) handlers.onComplete(p.data);
          if (p.type === 'ERROR') handlers.onError(p.error ?? p.message);
        },
        ac.signal,
      );
    } else {
      // EventSource 路径可包成 Promise，在 RESULT/ERROR/end 时 resolve
      await new Promise<void>((resolve, reject) => {
        const es = new EventSource(`${API_BASE}/api/agent/task/stream/${taskId}`);
        es.addEventListener('message', (ev) => {
          const p = JSON.parse(ev.data) as RouteAndRunTaskSsePayload;
          handlers.onProgress(p);
          if (p.type === 'RESULT' && p.data) {
            handlers.onComplete(p.data);
            es.close();
            resolve();
          }
          if (p.type === 'ERROR') {
            handlers.onError(p.error ?? p.message);
            es.close();
            reject(new Error(p.error ?? p.message));
          }
        });
        es.addEventListener('end', () => {
          es.close();
          resolve();
        });
        es.onerror = () => {
          es.close();
          reject(new Error('SSE error'));
        };
      });
    }
  } catch {
    if (options?.preferPollingFallback !== false) {
      await pollUntilDone(taskId, handlers, options?.accessToken);
    } else {
      throw new Error('SSE failed');
    }
  }
}

async function pollUntilDone(
  taskId: string,
  handlers: {
    onProgress: (p: RouteAndRunTaskSsePayload) => void;
    onComplete: (response: RouteAndRunResponseDto) => void;
    onError: (message: string) => void;
  },
  accessToken?: string,
) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${API_BASE}/api/agent/task/status/${taskId}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (res.status === 404) {
      handlers.onError('任务不存在或已过期');
      return;
    }
    const row = await res.json();
    handlers.onProgress({
      task_id: row.task_id,
      request_id: '',
      type: row.status === 'SUCCESS' ? 'RESULT' : row.status === 'FAILED' ? 'ERROR' : 'PHASE',
      current_phase: row.current_phase,
      progress_percentage: row.progress_percentage,
      message: row.message,
      status: row.status,
      ts: row.updated_at,
      error: row.error,
      data: row.data,
    });
    if (row.status === 'SUCCESS' && row.data) {
      handlers.onComplete(row.data);
      return;
    }
    if (row.status === 'FAILED') {
      handlers.onError(row.error ?? row.message);
      return;
    }
  }
}
```

---

## 6. UI 层怎么展示

| 字段 | UI 建议 |
|------|---------|
| `message` | 主文案（后端已本地化，如「正在检索 POI…」） |
| `progress_percentage` | 进度条（0–100） |
| `current_phase` | 步骤标签；可本地映射枚举（见下表） |
| `type === 'PHASE'` | 更新「思考中 / 规划中」面板 |
| `type === 'RESULT'` | 关闭进度 UI，用 `data` 走 **原有** 结果渲染逻辑 |
| `type === 'ERROR'` | Toast + 重试 |

### 阶段中文（可选本地表）

与后端 `orchestration-step-display.constants.ts` 对齐：

| `current_phase` | 展示 |
|-----------------|------|
| INTENT_COMPILE | 意图编译 |
| INTAKE | 需求接入 |
| RESEARCH | 数据调研 |
| POI_SELECTION | 兴趣点选择 |
| GATE_EVAL | 门禁评估 |
| PLAN_GEN | 方案生成 |
| VERIFY | 可执行性验证 |
| NARRATE | 决策叙事 |
| DONE | 已完成 |

---

## 7. 与存量逻辑的对照

| 存量 | 新做法 |
|------|--------|
| 长时间 await `POST route_and_run` | 改用 `async` + SSE，或 `async_mode: 'FORCE'` |
| `setInterval` 轮询 `task/status` | 主：SSE；辅：SSE `onerror` 后再轮询 |
| 只认 HTTP 200 + 完整 body | 终态从 SSE `RESULT.data` 取，结构与 200 相同 |
| Loading 转圈 | 分阶段进度条 + `message` 文案 |

**无需改**：解析 `RouteAndRunResponseDto.result`、行程卡片、action_plan 等 **结果层** 组件。

---

## 8. 请求体建议（长规划）

```typescript
const request: RouteAndRunRequestDto = {
  request_id: crypto.randomUUID(),
  message: userInput,
  trip_id: tripId,
  options: {
    async_mode: 'FORCE', // 或 'AUTO' 由后端判断是否委托
    intent_mode: 'AUTO',
    // ... 其它既有 options
  },
};
```

---

## 9.  checklist（前端自测）

- [ ] `async` 返回 202 + `task_id`
- [ ] SSE 连接后 **数秒内** 收到第一条 `PHASE`（非等 30s）
- [ ] 进度条随 `progress_percentage` 变化
- [ ] 成功：收到 `RESULT` + `end`，`data` 能渲染原结果页
- [ ] 失败：收到 `ERROR` + `end`，展示 `error`
- [ ] 路由离开 / 组件卸载：`EventSource.close()` 或 `AbortController.abort()`
- [ ] 断网：fallback 轮询仍能拿到终态
- [ ] （若已上 JWT）fetch SSE 带 Bearer，不用裸 EventSource

---

## 10. 规划助手 V2（管道 B，未实现）

`POST /api/agent/planning-assistant/v2/chat` 的 `options.stream` **后端尚未接 Token 流**。

/chat 仍是一次性 JSON。Token 逐字流是 **另一条线**，与本文 SSE **无关**；上线后再接 `@Sse` 或 fetch 流即可。

---

*维护：与 `GET /api/agent/task/stream/:taskId` 及 `RouteAndRunTaskProgressPayload` 同步。*
