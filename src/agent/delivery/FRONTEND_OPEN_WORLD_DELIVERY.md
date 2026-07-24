# 开放世界稀疏区交付层 — 前端集成指南

> 适用场景：格陵兰（GL）、斯瓦尔巴（SJ）等 **POI 密度极低** 目的地  
> 总览：[AGENT_UNIFIED_INTERFACE_SCOPE.md](./AGENT_UNIFIED_INTERFACE_SCOPE.md)  
> 数据路径：`response.result.payload.ui_display.open_world_discovery`  
> 核实 API：`POST /agent/open_world_verification/apply`  
> 原则：**provisional POI ≠ 已落地 placeId** — 展示核实任务与留白说明，勿当作普通 POI 一键导航。

---

## 1. 何时会出现

| 条件 | 后端行为 | 前端须做 |
|------|----------|----------|
| 目的地命中 sparse profile（GL/SJ） | POI 检索放宽 + 注入 elastic stub | 渲染核实卡 + 留白摘要 |
| 用户提及长尾体验（皮划艇、极光窗、防熊区等） | L1 Discovery → `verification_tasks` | 引导出发前核实 |
| `intentional_slack_summary_zh` 非空 | 日程刻意留白 | 勿提示「行程太空请加景点」 |

环境变量（服务端）：

| 变量 | 默认 | 说明 |
|------|------|------|
| `OPEN_WORLD_DISCOVERY_LLM` | `0` | `1` 时在规则抽取基础上追加 LLM mention |
| `OPEN_WORLD_DISCOVERY_LLM_PROVIDER` | 默认 provider | 可选覆盖 LLM 供应商 |

---

## 2. 读取路径

```typescript
const ui = response.result?.payload?.ui_display;
const discovery = ui?.open_world_discovery;

if (discovery?.schema === 'tripnara.open_world_discovery@v1') {
  // 渲染核实面板 — 见 §3
}
```

Narration 侧可辅助读：

```typescript
const summary = response.result?.payload?.narration?.decision_context_summary;
// 含 sparse slack / 核实提醒（SSOT 来自 DecisionState.constraints.decisionContext）
```

**不要**从 Markdown 正文解析 stub 列表；以 `open_world_discovery` 为准。

---

## 3. 页面布局建议

```
┌─────────────────────────────────────────┐
│ narration 摘要（含 decision_context）    │
├─────────────────────────────────────────┤
│ dual_track_itinerary / 时间轴            │  ← elastic 节点带「待核实」标签
├─────────────────────────────────────────┤
│ open_world_discovery 面板               │
│  · intentional_slack_summary_zh         │
│  · verification_tasks[]                 │
│    [标记已核实] [丢弃占位]               │
├─────────────────────────────────────────┤
│ booking_cart / map（若有）               │
└─────────────────────────────────────────┘
```

叠放顺序见 [AGENT_UNIFIED_INTERFACE_SCOPE.md](./AGENT_UNIFIED_INTERFACE_SCOPE.md) §7。

---

## 4. TypeScript 契约

```typescript
type OpenWorldVerificationTask = {
  task_id: string;
  stub_id: string;
  title_zh: string;
  description_zh: string;
  priority: 'P0' | 'P1';
  constraint_tags: string[];
  status: 'pending' | 'in_progress' | 'done';
  cta_label_zh: string;
};

type OpenWorldDiscoveryUi = {
  schema: 'tripnara.open_world_discovery@v1';
  sparse_profile_id?: string;
  mention_count: number;
  stub_count: number;
  verification_tasks: OpenWorldVerificationTask[];
  intentional_slack_summary_zh?: string;
  computed_at: string;
};
```

`constraint_tags` 常见值：`weather_window` · `guide_required` · `permit_required` · `bear_zone_buffer`

---

## 5. 核实状态机

**Endpoint：** `POST /agent/open_world_verification/apply`

无服务端持久化 — 客户端回传当前 `open_world_discovery` 快照，用响应更新本地 state / trip metadata。

### 5.1 标记已核实

```typescript
async function markVerified(
  discovery: OpenWorldDiscoveryUi,
  stubId: string,
  promotedPlaceId?: number,
) {
  const res = await fetch('/api/agent/open_world_verification/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      open_world_discovery: discovery,
      action: 'mark_verified',
      payload: {
        stub_id: stubId,
        ...(promotedPlaceId != null ? { promoted_place_id: promotedPlaceId } : {}),
      },
    }),
  });
  const data = await res.json();
  if (data.status === 'OK') {
    return data.open_world_discovery as OpenWorldDiscoveryUi;
  }
  throw new Error(data.rejection_reason_zh ?? '核实失败');
}
```

### 5.2 丢弃占位 stub

```typescript
async function discardStub(discovery: OpenWorldDiscoveryUi, stubId: string) {
  const res = await fetch('/api/agent/open_world_verification/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      open_world_discovery: discovery,
      action: 'discard_stub',
      payload: { stub_id: stubId },
    }),
  });
  const data = await res.json();
  if (data.status === 'OK') {
    return data.open_world_discovery as OpenWorldDiscoveryUi;
  }
  throw new Error(data.rejection_reason_zh ?? '丢弃失败');
}
```

### 5.3 响应字段

| 字段 | 说明 |
|------|------|
| `status` | `OK` · `REJECTED` |
| `open_world_discovery` | 更新后的 UI 快照（替换本地） |
| `updated_stub` | `status: promoted \| discarded` |
| `rejection_reason_zh` | 拒绝原因 |

---

## 6. 与地图 / 行程联动

| 场景 | 建议 |
|------|------|
| elastic stub 在 timeline 上 | 使用虚线边框 + 「待核实」badge |
| `mark_verified` + `promoted_place_id` | 可替换为真实 POI marker |
| `discard_stub` | 从 timeline 移除或折叠为「已放弃」 |
| 留白 slot | 显示 `intentional_slack_summary_zh`，不提供「添加 POI」强 CTA |

---

## 7. Checklist

- [ ] SUCCESS 后检查 `ui_display.open_world_discovery`，无则跳过面板
- [ ] 核实操作走 `open_world_verification/apply`，不回写 `route_and_run`
- [ ] 用返回快照覆盖本地 `open_world_discovery`
- [ ] 稀疏区不对用户展示「POI 不足请补全」类负面 copy
- [ ] narration 与核实面板文案一致（均来自 SSOT decisionContext）

---

*维护：与 `DecisionUiDisplayDto.open_world_discovery` · `ApplyOpenWorldVerificationRequestDto` 同步。*
