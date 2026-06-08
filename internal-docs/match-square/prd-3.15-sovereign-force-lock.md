# PRD 3.15 队长强制成团（Sovereign Force Lock）

Decision OS · Match Square · 队长主权缩编  
**前置依赖**：§3.12 成团实例化 · §3.13 任务飞轮 · §3.14 体能硬约束

---

## 1. 产品动机

满员 `closed` 是理想路径，但硬核徒步/高预算招募常出现「核心队员已到、空缺拼图位长期无人补齐」的情况。队长需要 **在不凑满原 slotsNeeded 的前提下锁死阵容**，裁剪开放拼图位，拒绝 pending 申请，并继续走 Active Trip 实例化。

| 对比 | 常规成团 | Sovereign Force Lock |
|------|----------|----------------------|
| 触发 | `slotsFilled >= slotsNeeded` 自动 closed | 队长主动 POST force-lock |
| slotsNeeded | 不变 | 缩编为当前 `slotsFilled` |
| pending 申请 | 满员后不可再申请 | 批量 `rejected` |
| 实例化门槛 | 满员 closed | closed + snapshot `_sovereignForceLock_v1` |

---

## 2. 准入条件

- 招募 `status === 'active'`
- 调用者为 `captainUserId`
- `slotsFilled >= 1`（至少 1 名已通过队员）
- `slotsFilled < slotsNeeded`（未满员；已满员走常规流程）
- 尚未执行过 force-lock（snapshot 无 `_sovereignForceLock_v1`）

---

## 3. API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/match-square/posts/:id/force-lock/preview` | 预览缩编影响 |
| POST | `/match-square/posts/:id/force-lock` | 执行锁团；body `{ note?, skipInstantiate? }` |

### 3.1 Preview 响应字段

```typescript
{
  postId: string;
  canForceLock: boolean;
  blockReason: string | null;
  currentCrew: Array<{ userId; role; slotLabel; displayName; applicationId? }>;
  droppedOpenSlots: Array<{ slotIndex; slotId; roleLabel; deficitTag }>;
  physicalDeficits: string[];       // 全队物理赤字文案
  resilienceScore: number;          // 35–100，缩编惩罚
  vaultRecalc: {
    previousSplitBase: number;    // 1 + 原 slotsNeeded
    actualSplitBase: number;      // 1 + 当前 slotsFilled
    budgetPerPersonCents: number | null;
    summaryLine: string;
  };
  pendingApplicationsToReject: number;
  confirmHeadline: string;
  confirmLines: string[];
}
```

### 3.2 Commit 响应字段

```typescript
{
  postId: string;
  sovereignLock: SovereignForceLockRecord;
  rejectedApplicationIds: string[];
  instantiation: TripInstantiationResultView | null;
  activeTripPath: string | null;
  dnaScheduled: boolean;
}
```

默认 `skipInstantiate !== true` 时链式调用 `instantiate-trip`（`skipIfExists: true`）。

---

## 4. 持久化

写入 `captainPersonaSnapshot._sovereignForceLock_v1`：

- `originalSlotsNeeded` / `effectiveSlotsNeeded`
- `droppedOpenSlots` / `physicalDeficits`
- `vaultRecalc` / `resilienceScore`
- `pendingApplicationsRejected`
- `taskRebalanceNote`（公摊物资重派说明）

同时更新 post：

- `status = closed`, `closedAt = now`
- `slotsNeeded = slotsFilled`

---

## 5. 与实例化引擎联动

`buildTripInstantiationPlan` 在检测到 sovereign snapshot 时：

- `isSovereignSealedPost(post) === true` 视为 sealed
- 允许 `slotsFilled < originalSlotsNeeded` 的 closed 帖实例化
- crew 仍为队长 + 全部 `approved` 申请

---

## 6. DNA 回流

`PreferenceEvolutionReason.SOVEREIGN_FORCE_LOCK` — 队长决策 DNA 异步 sync（throttle 60s）。

---

## 7. 前端建议

1. 队长详情页：`status === 'active' && slotsFilled >= 1 && slotsFilled < slotsNeeded` 展示 **🔒 锁死阵容**
2. Bottom Sheet 先调 preview，展示 `confirmLines` + `vaultRecalc.summaryLine`
3. 确认后 POST force-lock；成功跳转 `activeTripPath` 或刷新 `post.sovereignLock`
4. 已锁团：`post.sovereignLock != null`，隐藏 force-lock 入口

---

## 8. 实现索引

| 模块 | 路径 |
|------|------|
| Types | `src/match-square/types/sovereign-force-lock.types.ts` |
| Engine | `src/match-square/engine/sovereign-force-lock.engine.ts` |
| Service | `src/match-square/sovereign-force-lock.service.ts` |
| Controller | `match-square.controller.ts` force-lock routes |
| Instantiation | `trip-instantiation.engine.ts` `isSovereignSealedPost` |
