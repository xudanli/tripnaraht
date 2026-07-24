# 异步任务 Worker Lease — 前端集成指南（P2）

> 适用接口：`POST /api/agent/route_and_run/async` · `GET /api/agent/task/status/:taskId` · `POST /api/agent/task/resume/:taskId`  
> 总览：[AGENT_UNIFIED_INTERFACE_SCOPE.md](./AGENT_UNIFIED_INTERFACE_SCOPE.md)  
> 数据路径：`status.task_lease_v1`（`tripnara.route_and_run_task_lease@v1`）  
> 原则：**长任务可能 Worker 挂起** — 靠心跳 TTL 检测 STALE，并用 `durable_trip_run_id` 断点续跑。

配合 [route-and-run-sse-frontend-guide.md](../../../internal-docs/agent/route-and-run-sse-frontend-guide.md) 使用。

---

## 1. 背景（一句话）

异步编排跑在后台 Worker 上。若超过 **90s**（默认，可 env 配置）无进度心跳，lease 变为 **STALE**。轮询 `task/status` 时后端会**自动尝试 resume**；前端也可显式 `POST task/resume/:taskId`。

---

## 2. 推荐流程

```
1. POST /api/agent/route_and_run/async  → task_id
2. GET  /api/agent/task/stream/{task_id}  (SSE 主路径)
3. 每 2–5s GET /api/agent/task/status/{task_id}  (兜底 + 读 task_lease_v1)
4. lease_status === STALE  → 展示「正在恢复…」；轮询会自动 resume
5. lease_status === EXHAUSTED → 展示失败 + 重试入口
6. status === SUCCESS → 用 data 渲染（含 flawed_draft_v1 / ui_display）
```

显式续跑（可选，与轮询自动 resume 等价）：

```
POST /api/agent/task/resume/{task_id}  → 202 { task_id, resumed: true }
```

---

## 3. `task_lease_v1` 契约

```typescript
type TaskLeaseStatus = 'ACTIVE' | 'STALE' | 'RESUMING' | 'EXHAUSTED';

interface TaskLeaseEchoV1 {
  schemaId: 'tripnara.route_and_run_task_lease@v1';
  version: 1;
  lease_status: TaskLeaseStatus;
  heartbeat_at: string;       // ISO — 最近 Worker 心跳
  lease_ttl_sec: number;        // 默认 90
  resume_count: number;         // 已续跑次数
  max_resume: number;           // 默认 2
  durable_trip_run_id?: string | null; // 断点锚点（TripRun）
  worker_instance_id?: string;
}
```

`GET task/status` 响应片段：

```typescript
interface RouteAndRunTaskStatusResponse {
  task_id: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  current_phase: string;
  progress_percentage: number;
  message: string;
  data: RouteAndRunResponseDto | null;
  updated_at: string;
  task_lease_v1?: TaskLeaseEchoV1;
}
```

---

## 4. UI 状态机

| `lease_status` | `status` | UI 建议 |
|----------------|----------|---------|
| `ACTIVE` | `PROCESSING` | 正常进度条 + SSE message |
| `RESUMING` | `PROCESSING` | 「连接中断，正在从检查点恢复…」+  indeterminate |
| `STALE` | `PROCESSING` | 同上；下一次 poll 会触发后台 resume |
| `EXHAUSTED` | `FAILED` 或仍 `PROCESSING` | 「多次恢复失败」+ **重新发起规划** CTA |
| `ACTIVE` | `SUCCESS` | 正常 SUCCESS（lease 对终态无 STALE 语义） |

**注意**：`EXHAUSTED` 时 `message` / `error` 可能含 `max resume exhausted`；勿无限 poll。

---

## 5. 轮询 Hook 示例

```typescript
async function pollTaskStatus(taskId: string): Promise<RouteAndRunTaskStatusResponse> {
  const res = await fetch(`${API_BASE}/api/agent/task/status/${encodeURIComponent(taskId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function useTaskWithLease(taskId: string | null) {
  const [status, setStatus] = useState<RouteAndRunTaskStatusResponse | null>(null);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    const tick = async () => {
      const s = await pollTaskStatus(taskId);
      if (cancelled) return;
      setStatus(s);
      const lease = s.task_lease_v1?.lease_status;
      if (s.status === 'SUCCESS' || s.status === 'FAILED') return;
      if (lease === 'EXHAUSTED') return;
      setTimeout(tick, lease === 'STALE' || lease === 'RESUMING' ? 1500 : 3000);
    };
    void tick();
    return () => { cancelled = true; };
  }, [taskId]);

  return status;
}
```

显式 resume（SSE 长时间无事件且 `lease_status === STALE` 时可选）：

```typescript
await fetch(`${API_BASE}/api/agent/task/resume/${taskId}`, { method: 'POST' });
```

---

## 6. 与 SSE 的关系

| 通道 | 含 `task_lease_v1`？ | 用途 |
|------|---------------------|------|
| SSE `task/stream` | 否（进度 event 无 lease 字段） | 实时 phase / RESULT |
| Poll `task/status` | **是** | lease 检测 + 自动 resume + 终态 data |

**实践**：SSE 负责 UX 流畅；poll 负责 lease 与终态兜底（SSE 断线时尤其重要）。

---

## 7. 环境变量（运维）

| 变量 | 默认 | 含义 |
|------|------|------|
| `ROUTE_AND_RUN_TASK_LEASE_SEC` | `90` | 无心跳判定 STALE 的秒数 |
| `ROUTE_AND_RUN_TASK_MAX_RESUME` | `2` | 单 task 最大续跑次数 |

前端可展示 `lease_ttl_sec` / `max_resume` 做「预计仍可自动恢复 N 次」提示（可选）。

---

## 8. Checklist

- [ ] 异步 UI 同时订阅 SSE **与** 低频 poll（读 `task_lease_v1`）
- [ ] `STALE` / `RESUMING` 不当作硬失败
- [ ] `EXHAUSTED` 停止 poll，引导用户重新 POST async
- [ ] SUCCESS 后检查 `data.result.payload.flawed_draft_v1`（见 [FRONTEND_FLAWED_DRAFT_DELIVERY.md](./FRONTEND_FLAWED_DRAFT_DELIVERY.md)）
- [ ] 不依赖 `durable_trip_run_id` 做前端逻辑；只读展示/debug

相关文档：[FRONTEND_BOOKING_DELIVERY.md](./FRONTEND_BOOKING_DELIVERY.md) · [FRONTEND_FLAWED_DRAFT_DELIVERY.md](./FRONTEND_FLAWED_DRAFT_DELIVERY.md)
