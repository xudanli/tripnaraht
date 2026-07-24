# AI 自动执行授权中心

> 产品 SSOT · 与 `automation-action.catalog.ts` 对齐  
> 版本 1.0.0 · 2026-07-04

## 定义

TripNARA 的 AI 自动执行，不是让 AI 完全接管旅行，而是：

- **事实变化** → AI 自动更新  
- **计算变化** → AI 自动重算  
- **轻微变化** → AI 可以自动修复  
- **重大变化** → AI 提供方案并请求确认  
- **资金、法律和安全免责** → AI 不得自主执行  

## 三层边界

| 层级 | 判断标准 | 用户感知 |
|------|---------|---------|
| **AUTO** | 低风险、可撤销、无直接费用、不改变核心目标 | AI 已处理，可撤销 |
| **ASK** | 改变体验、产生费用、影响预约或成员 | 需要我决定 |
| **DENY** | 资金/法律/安全底线；AI 未经确认不得执行 | 禁止自动执行（用户确认后系统可代为执行） |

> **注意：** 「删除核心活动」属于 ASK，不是 DENY。禁止的是 *AI 未经确认自动删除*。

## 授权模型

```
有效授权 = catalog.defaultTier
         ∩ user.actionOverrides（若有）
         ∩ action.floorTier（硬底线，不可升级为 AUTO）
         ∩ automation.defaultLevel（全局级别门控）
         ∩ executionConditions（执行条件）
```

持久化：`trip.metadata.travelDecisionContract.automation`

```typescript
interface AutomationPolicy {
  defaultLevel: AutomationLevel;
  /** @deprecated legacy — 决策链 fallback；C 端展示勿用，读 catalog */
  autoAllowed: string[];
  /** @deprecated legacy — 决策链 fallback；C 端展示勿用，读 catalog */
  confirmationRequired: string[];
  actionOverrides?: Record<string, AutomationPermissionTier>;
  executionConditions?: Record<string, AutomationExecutionConditions>;
}
```

**C 端展示 SSOT：** `GET /travel-status` 或 BFF `automation.catalog` + `tierCounts`。控制台 automation 区块仅渲染 catalog 摘要或隐藏。

## 页面结构（6 组）

1. **环境监控** — 默认 AUTO  
2. **时间与路线** — 前五项 AUTO，跨天移动 ASK  
3. **活动与体验** — 普通/可选 AUTO，核心/预订 ASK  
4. **预算与预订** — 预测 AUTO，其余 ASK 或 DENY  
5. **安全与风险** — 保守操作 AUTO，提高风险 DENY  
6. **团队与隐私** — 内部同步 AUTO，对外/隐私 ASK 或 DENY  

完整动作列表见 `src/decision-runtime/authorization/automation-action.catalog.ts`。

## 冷启动首批 10 项

1. 自动更新天气和道路状态  
2. 自动重新计算预计到达时间  
3. 自动判断当天行程是否还能完成  
4. 自动生成 Plan B（不自动启用）  
5. 自动重排未预订低优先级活动  
6. 缩短或删除可选项目（默认 ASK，可 override 为 AUTO）  
7. 自动插入休息、加油和缓冲时间  
8. 自动生成并更新旅行任务  
9. 自动记录行程变更并同步给成员  
10. 自动发现需要用户决策的问题并进入决策队列  

## 工程落点

| 组件 | 路径 |
|------|------|
| 动作目录 SSOT | `decision-runtime/authorization/automation-action.catalog.ts` |
| Tier 解析 | `decision-runtime/authorization/utils/automation-action.resolver.util.ts` |
| 执行链评估 | `decision-runtime/authorization/utils/decision-automation-policy.util.ts` |
| 合同类型 | `trips/trip-constraint-solver/types/travel-decision-contract.types.ts` |
| BFF 投影 | `GET /trips/:id/travel-status` → `automation.catalog` |
| 变更日志 + 撤销 | `trip.metadata.automationChangeLog` · `POST .../ai-completed-work/:logId/undo` |
| 自动 apply 链 | `decision-runtime/monitoring/decision-automation-chain.service.ts` |

## 相关文档

- [TRIPNARA_AI_NATIVE_POSITIONING.md](./TRIPNARA_AI_NATIVE_POSITIONING.md) §5.5  
- [TRAVEL_DECISION_CONTRACT_FRONTEND_API.md](../../src/trips/trip-constraint-solver/TRAVEL_DECISION_CONTRACT_FRONTEND_API.md)  
- [DECISION_RUNTIME_ROADMAP.md](../../src/decision-runtime/DECISION_RUNTIME_ROADMAP.md) §Authorization  
