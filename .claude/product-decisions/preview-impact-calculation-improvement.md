# 预览模式影响计算改进方案

**创建日期**: 2026-02-10  
**状态**: ⏳ 待实施  
**优先级**: P2（提升准确性）

---

## 📋 问题描述

当前预览模式使用**硬编码的估算值**来计算影响：

### 当前实现

**代码位置**: `src/trips/services/trip-suggestions.service.ts:399-442`

```typescript
case 'TIME_CONFLICT':
  bufferDelta += 30;  // 硬编码：每个时间冲突 +30 分钟
  fatigueDelta -= 2;  // 硬编码：每个时间冲突 -2 疲劳
  costDelta += 0;     // 硬编码：时间冲突不涉及费用
```

**问题**:
- ❌ 所有时间冲突使用相同的估算值（30分钟缓冲）
- ❌ 不考虑实际重叠时间
- ❌ 不考虑冲突涉及的活动类型和数量

### 用户反馈

用户看到的值（-8疲劳, +120分钟缓冲, $0费用）是基于：
- 4个时间冲突 × (-2疲劳) = -8疲劳
- 4个时间冲突 × (+30分钟缓冲) = +120分钟缓冲
- 4个时间冲突 × (0费用) = 0费用

**这些值仍然是硬编码的估算值**，不是基于实际冲突数据计算的。

---

## 🎯 改进目标

### 目标

1. **基于实际数据**: 使用实际冲突数据（重叠时间、活动类型等）计算影响
2. **更准确**: 不同冲突产生不同的影响值
3. **可理解**: 用户能看到影响是如何计算的

---

## 💡 改进方案

### 方案A：基于实际重叠时间计算（推荐）

**核心思路**: 使用冲突的实际重叠时间来计算缓冲时间增加

**实现步骤**:

1. **从冲突数据中提取重叠时间**:
   ```typescript
   // 时间冲突通常包含受影响的行程项ID
   const conflict = suggestion.metadata.conflict;
   const item1 = await getItineraryItem(conflict.affectedItemIds[0]);
   const item2 = await getItineraryItem(conflict.affectedItemIds[1]);
   
   // 计算实际重叠时间
   const overlapMinutes = calculateOverlapMinutes(item1, item2);
   // 例如：重叠 45 分钟
   ```

2. **基于重叠时间计算缓冲增加**:
   ```typescript
   // 解决时间冲突后，通常会增加等于或大于重叠时间的缓冲
   const bufferIncrease = Math.max(overlapMinutes, 15); // 至少15分钟
   // 例如：45分钟重叠 → 增加45分钟缓冲
   ```

3. **基于活动类型计算疲劳影响**:
   ```typescript
   // 如果涉及高强度活动，疲劳改善更明显
   const fatigueDecrease = calculateFatigueImpact(item1, item2, overlapMinutes);
   // 例如：高强度活动 + 45分钟重叠 → -5疲劳
   ```

**优点**:
- ✅ 基于实际数据，更准确
- ✅ 不同冲突产生不同影响值
- ✅ 用户能看到影响的计算依据

**缺点**:
- ❌ 需要查询数据库获取行程项数据
- ❌ 实现稍复杂

---

### 方案B：在冲突数据中添加重叠时间信息

**核心思路**: 在生成冲突时，就计算并存储重叠时间

**实现步骤**:

1. **修改 `TripConflictsService.detectDayConflicts`**:
   ```typescript
   // 检测时间冲突时，计算并存储重叠时间
   if (currentEnd > nextStart) {
     const overlapMinutes = currentEnd.diff(nextStart, 'minutes').minutes;
     
     conflicts.push({
       id: `time-conflict-${current.id}-${next.id}`,
       type: ConflictType.TIME_CONFLICT,
       severity: ConflictSeverity.HIGH,
       title: '时间冲突',
       description: `活动 "${current.Place?.nameCN}" 与 "${next.Place?.nameCN}" 时间重叠 ${overlapMinutes} 分钟`,
       overlapMinutes: overlapMinutes, // 新增字段
       affectedDays: [date],
       affectedItemIds: [current.id, next.id],
       // ...
     });
   }
   ```

2. **在估算影响时使用重叠时间**:
   ```typescript
   case 'TIME_CONFLICT':
     const overlapMinutes = (suggestion.metadata as any)?.overlapMinutes || 30;
     bufferDelta += Math.max(overlapMinutes, 15); // 使用实际重叠时间
     fatigueDelta -= Math.min(overlapMinutes / 10, 5); // 基于重叠时间计算
     costDelta += 0;
     break;
   ```

**优点**:
- ✅ 不需要额外查询数据库
- ✅ 数据在冲突检测时就计算好了
- ✅ 实现相对简单

**缺点**:
- ❌ 需要修改冲突数据结构
- ❌ 需要更新所有使用冲突的地方

---

### 方案C：模拟应用建议后计算（最准确）

**核心思路**: 在预览模式下，临时应用建议，计算实际影响，然后回滚

**实现步骤**:

1. **开始事务**
2. **应用建议**（临时）
3. **计算指标变化**
4. **回滚事务**

**优点**:
- ✅ 最准确，基于实际计算

**缺点**:
- ❌ 实现复杂
- ❌ 性能开销大
- ❌ 可能有副作用

---

## 📊 推荐方案

### 推荐：**方案B（在冲突数据中添加重叠时间信息）**

**理由**:
1. ✅ 实现相对简单
2. ✅ 不需要额外查询
3. ✅ 数据在冲突检测时就准备好了
4. ✅ 可以逐步迁移（向后兼容）

---

## 🔧 实施计划

### 阶段1：添加重叠时间字段

1. **修改 `ConflictDto`**:
   ```typescript
   export class ConflictDto {
     // ... 现有字段
     
     @ApiPropertyOptional({ description: '时间重叠分钟数（仅TIME_CONFLICT类型）' })
     overlapMinutes?: number;
   }
   ```

2. **修改 `TripConflictsService.detectDayConflicts`**:
   - 计算并存储 `overlapMinutes`

### 阶段2：改进估算逻辑

1. **修改 `estimateImpactBySuggestionType`**:
   - 使用 `overlapMinutes` 计算缓冲增加
   - 基于重叠时间和活动类型计算疲劳影响

### 阶段3：测试验证

1. 测试不同重叠时间的冲突
2. 验证影响计算的准确性

---

## 📝 预期效果

### 当前（硬编码）

```json
{
  "impact": {
    "metrics": {
      "fatigue": -8,      // 4个冲突 × -2
      "buffer": 120,      // 4个冲突 × 30分钟
      "cost": 0           // 4个冲突 × 0
    }
  }
}
```

### 改进后（基于实际数据）

```json
{
  "impact": {
    "metrics": {
      "fatigue": -12,     // 基于实际重叠时间和活动类型计算
      "buffer": 180,      // 基于实际重叠时间：45+60+30+45=180分钟
      "cost": 0           // 时间冲突不涉及费用
    },
    "calculation": {
      "conflicts": [
        { "overlapMinutes": 45, "bufferIncrease": 45 },
        { "overlapMinutes": 60, "bufferIncrease": 60 },
        { "overlapMinutes": 30, "bufferIncrease": 30 },
        { "overlapMinutes": 45, "bufferIncrease": 45 }
      ]
    }
  }
}
```

---

## ⚠️ 注意事项

1. **向后兼容**: 如果冲突没有 `overlapMinutes` 字段，使用默认值（30分钟）
2. **性能**: 计算重叠时间不影响性能（已经在冲突检测时计算）
3. **数据一致性**: 确保所有时间冲突都包含 `overlapMinutes` 字段

---

## 📚 相关文档

- `scripts/IMPACT_METRICS_ACCURACY_ANALYSIS.md` - 影响分析准确性分析
- `scripts/IMPACT_METRICS_IMPLEMENTATION_SUMMARY.md` - 影响指标实施总结
- `src/trips/services/trip-conflicts.service.ts` - 冲突检测服务
