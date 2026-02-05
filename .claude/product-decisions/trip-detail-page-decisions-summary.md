# 行程详情页关键决策汇总

**文档信息**:
- **创建日期**: 2026-02-05
- **状态**: ✅ 已确认（4/6项）
- **确认人**: 产品经理
- **确认日期**: 2026-02-05

---

## ✅ 已确认的决策

### 1. 健康度计算逻辑：木桶效应

**决策**: 采用木桶效应（取最低分）

**实现**:
```typescript
// src/skills/detail/detail-analyze-health.skill.ts
const scores = [schedule.score, budget.score, pace.score, feasibility.score];
const overallScore = Math.min(...scores);
```

**理由**: 最严格的标准，确保所有维度都健康

**影响**: 所有健康度展示将使用此公式

---

### 2. 状态转换规则：禁止 IN_PROGRESS → PLANNING

**决策**: 禁止进行中的行程改回规划中

**实现**:
```typescript
// src/trips/trips.service.ts
if (currentStatus === TripStatus.IN_PROGRESS && newStatus === TripStatus.PLANNING) {
  throw new BadRequestException('进行中的行程不能改回规划中状态。如需重新规划，请使用规划工作台功能');
}
```

**理由**: 避免数据混乱，行程一旦开始不应回退

**影响**: 状态管理逻辑已更新

---

### 3. Auto综合优化范围：只应用高优先级建议

**决策**: Auto综合功能只应用高优先级建议

**实现**:
```typescript
// 筛选高优先级建议
const highPrioritySuggestions = suggestions.filter(s => s.priority === 'high');
```

**理由**: 安全性高，只应用最重要的建议，减少误操作风险

**影响**: Auto综合功能需要更新筛选逻辑

**待实现位置**:
- `src/trips/services/trip-suggestions.service.ts` (applySuggestion)
- `src/agent/planning-workbench.controller.ts` (applyBudgetOptimization)

---

### 4. 健康度展示位置：只在头部显示

**决策**: 健康度只在头部区域显示，不在侧边栏显示

**实现**: UI设计时只在头部区域显示健康度

**理由**: 信息集中，避免重复，符合渐进式披露原则

**影响**: UI布局设计

---

## ⏳ 待确认的决策

### 5. 建议应用确认：哪些操作需要确认弹窗？

**状态**: ⏳ 待确认

**建议方案**: 方案B（重要操作需要确认）
- Auto综合：需要确认
- 批量应用（>3条）：需要确认
- 高影响建议：需要确认
- 单个低影响建议：可直接应用

---

### 6. Auto综合优化反馈：如何提供更好的反馈？

**状态**: ⏳ 待确认

**建议方案**: 方案A（Toast提示 + 详情卡片）
- Toast提示：即时反馈
- 详情卡片：可展开查看详细信息

---

## 📊 决策影响分析

| 决策项 | 代码修改 | UI修改 | 测试影响 | 优先级 |
|--------|---------|--------|---------|--------|
| 1. 健康度计算 | ✅ 已完成 | 无 | 需要更新测试 | P0 |
| 2. 状态转换 | ✅ 已完成 | 无 | 需要更新测试 | P0 |
| 3. Auto综合范围 | ⏳ 待实现 | 无 | 需要测试 | P0 |
| 4. 健康度展示 | 无 | ⏳ 待设计 | 需要测试 | P1 |
| 5. 应用确认 | ⏳ 待确认 | ⏳ 待设计 | 需要测试 | P0 |
| 6. 优化反馈 | ⏳ 待确认 | ⏳ 待设计 | 需要测试 | P1 |

---

## 🎯 下一步行动

### 立即执行（P0）
1. ✅ 更新健康度计算逻辑（已完成）
2. ✅ 更新状态转换规则（已完成）
3. ⏳ 实现Auto综合只应用高优先级建议
4. ⏳ 确认建议应用确认规则

### 后续执行（P1）
5. ⏳ 确认Auto综合反馈方式
6. ⏳ UI设计：健康度只在头部显示

---

**文档状态**: ✅ 部分已确认  
**最后更新**: 2026-02-05
