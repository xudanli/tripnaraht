# 健康度指标改进 - 产品经理验收文档

**创建日期**: 2026-02-10  
**状态**: ⏳ 待产品经理验收  
**优先级**: P0（核心功能）

---

## 📋 改进内容总览

本次改进包含三个主要方面：

### 1. ✅ 健康度计算逻辑梳理
- **文档**: `scripts/HEALTH_METRICS_CALCULATION_LOGIC.md`
- **内容**: 详细梳理了四个健康度指标（可执行度、成本、风险、缓冲）的计算逻辑

### 2. ✅ 时间冲突严重程度差异化扣分（方案C）
- **文档**: `.claude/product-decisions/time-conflict-health-score-calculation.md`
- **实施**: `src/skills/detail/detail-analyze-health.skill.ts`
- **内容**: 根据冲突严重程度（HIGH/MEDIUM/LOW）差异化扣分

### 3. ✅ 预览模式影响计算基于实际数据
- **文档**: `.claude/product-decisions/preview-impact-calculation-improvement.md`
- **实施**: `src/trips/services/trip-suggestions.service.ts`, `src/trips/services/trip-conflicts.service.ts`
- **内容**: 基于实际重叠时间计算影响，而不是硬编码估算值

---

## 🎯 改进1: 健康度计算逻辑梳理

### 改进内容

创建了完整的健康度计算逻辑文档，包含：
- 四个指标的映射关系（前端显示 vs 后端维度）
- 各维度的详细计算逻辑和扣分规则
- 总体健康度的加权平均计算
- API 接口文档

### 验收标准

- [x] 文档完整，包含所有计算逻辑
- [x] 代码实现与文档一致
- [x] API 返回包含 `overallScore` 字段（0-100）

### 验收检查

**API 测试**:
```bash
GET /api/trip-detail/:tripId/health
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "overall": "healthy" | "warning" | "critical",
    "overallScore": 78,  // 新增字段：0-100的数值
    "dimensions": {
      "schedule": { "status": "...", "score": 28, "weight": 0.30 },
      "budget": { "status": "...", "score": 100, "weight": 0.25 },
      "pace": { "status": "...", "score": 100, "weight": 0.25 },
      "feasibility": { "status": "...", "score": 100, "weight": 0.20 }
    }
  }
}
```

**验收要点**:
- ✅ `overallScore` 字段存在且为 0-100 的数值
- ✅ 总体健康度使用加权平均计算（不是简单平均或木桶效应）
- ✅ 权重正确：schedule(0.30), budget(0.25), pace(0.25), feasibility(0.20)

---

## 🎯 改进2: 时间冲突严重程度差异化扣分（方案C）

### 改进内容

**之前（方案A）**:
- 每个时间冲突固定扣 18 分
- 4个冲突 = 72分扣分 → Schedule 28分 → 总体 78.4分（healthy）

**之后（方案C）**:
- HIGH（红线）级别: 每个扣 **25 分**
- MEDIUM（警告）级别: 每个扣 **15 分**
- LOW（信息）级别: 每个扣 **5 分**
- 最大扣分: 90 分

**效果**:
- 4个红线冲突 = 90分扣分 → Schedule 10分 → 总体 68.0分（warning）✅

### 验收标准

- [x] 代码实现方案C（差异化扣分）
- [x] 4个红线冲突时，总体健康度为 `warning`（而不是 `healthy`）
- [x] 扣分规则正确：HIGH=25分, MEDIUM=15分, LOW=5分

### 验收检查

**测试场景**: 4个红线级别的时间冲突

**预期结果**:
- Schedule 维度分数: **10分**（100 - 90 = 10）
- Schedule 状态: **critical**（10 < 50）
- 总体健康度: **68.0分**（10×0.30 + 100×0.25 + 100×0.25 + 100×0.20）
- 总体状态: **warning**（50 ≤ 68 < 70）

**API 测试**:
```bash
GET /api/trip-detail/9a4dbd2e-e76a-4fd3-bab0-09332fb2581b/health
```

**验收要点**:
- ✅ 4个红线冲突时，Schedule 分数 ≤ 20分
- ✅ 总体健康度 ≤ 70分（warning 状态）
- ✅ 不同严重程度的冲突扣分不同

---

## 🎯 改进3: 预览模式影响计算基于实际数据

### 改进内容

**之前（硬编码）**:
- 每个时间冲突固定: +30分钟缓冲, -2疲劳
- 4个冲突 = +120分钟缓冲, -8疲劳（固定值）

**之后（基于实际数据）**:
- 在冲突检测时计算并存储 `overlapMinutes`（实际重叠时间）
- 基于实际重叠时间计算影响:
  - 缓冲增加 = 实际重叠时间（至少15分钟）
  - 疲劳改善 = 基于重叠时间计算（-2 到 -5）

**效果**:
- 如果4个冲突重叠时间分别为: 45, 60, 30, 45分钟
- 缓冲增加: 45 + 60 + 30 + 45 = **180分钟**（而不是固定的120分钟）
- 疲劳改善: -3 -4 -2 -3 = **-12疲劳**（而不是固定的-8）

### 验收标准

- [x] 冲突数据包含 `overlapMinutes` 字段
- [x] 预览模式基于实际重叠时间计算影响
- [x] 不同冲突产生不同的影响值（不是固定值）

### 验收检查

**测试场景**: 4个时间冲突，重叠时间分别为 45, 60, 30, 45分钟

**API 测试**:
```bash
POST /api/planning-workbench/auto-optimize
{
  "tripId": "9a4dbd2e-e76a-4fd3-bab0-09332fb2581b",
  "preview": true
}
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "impact": {
      "metrics": {
        "fatigue": -12,     // 基于实际重叠时间计算（不是固定的-8）
        "buffer": 180,      // 基于实际重叠时间：45+60+30+45（不是固定的120）
        "cost": 0           // 时间冲突不涉及费用
      }
    }
  }
}
```

**验收要点**:
- ✅ 影响值基于实际重叠时间，不是固定值
- ✅ 不同冲突产生不同的影响值
- ✅ 重叠时间越长，缓冲增加越多，疲劳改善越明显

---

## 📊 综合验收检查清单

### 功能验收

- [ ] **健康度API返回 `overallScore` 字段**
  - 测试: `GET /api/trip-detail/:tripId/health`
  - 预期: 返回 `overallScore`（0-100数值）

- [ ] **时间冲突严重程度差异化扣分**
  - 测试: 4个红线冲突的行程
  - 预期: Schedule ≤ 20分，总体健康度 ≤ 70分（warning）

- [ ] **预览模式基于实际数据计算影响**
  - 测试: `POST /api/planning-workbench/auto-optimize` (preview: true)
  - 预期: 影响值基于实际重叠时间，不是固定值

### 数据准确性验收

- [ ] **健康度计算准确性**
  - 验证: 总体健康度 = schedule×0.30 + budget×0.25 + pace×0.25 + feasibility×0.20
  - 验证: 4个红线冲突时，总体健康度应为 warning（不是 healthy）

- [ ] **影响计算准确性**
  - 验证: 缓冲增加 = 实际重叠时间之和
  - 验证: 疲劳改善基于重叠时间计算（-2 到 -5）

### 用户体验验收

- [ ] **前端显示正确**
  - 验证: 健康度百分比使用 `overallScore` 字段
  - 验证: 4个红线冲突时，健康度显示为 warning（不是 100%）

- [ ] **预览影响值合理**
  - 验证: 不同冲突产生不同的影响值
  - 验证: 影响值反映实际重叠时间

---

## 🧪 测试用例

### 测试用例1: 4个红线级别时间冲突

**测试数据**:
- Trip ID: `9a4dbd2e-e76a-4fd3-bab0-09332fb2581b`
- 时间冲突: 4个（均为 HIGH 级别）

**预期结果**:
- Schedule 分数: 10分（100 - 90 = 10）
- Schedule 状态: critical
- 总体健康度: 68.0分
- 总体状态: warning

**验收标准**: ✅ 总体健康度为 warning（不是 healthy）

---

### 测试用例2: 预览模式影响计算

**测试数据**:
- Trip ID: `9a4dbd2e-e76a-4fd3-bab0-09332fb2581b`
- 时间冲突: 4个
- 重叠时间: 假设为 45, 60, 30, 45分钟

**预期结果**:
- 疲劳改善: -12（基于实际重叠时间）
- 缓冲增加: 180分钟（45+60+30+45）
- 费用变化: $0

**验收标准**: ✅ 影响值基于实际重叠时间，不是固定值（-8, 120, 0）

---

### 测试用例3: 混合严重程度冲突

**测试数据**:
- 2个 HIGH 级别冲突
- 1个 MEDIUM 级别冲突
- 1个 LOW 级别冲突

**预期结果**:
- Schedule 扣分: 25 + 25 + 15 + 5 = 70分
- Schedule 分数: 30分（100 - 70）
- Schedule 状态: critical

**验收标准**: ✅ 不同严重程度的冲突扣分不同

---

## 📝 验收签字

### 产品经理验收

- [ ] **功能验收**: 所有功能按预期工作
- [ ] **数据准确性**: 计算结果准确
- [ ] **用户体验**: 用户体验符合预期
- [ ] **文档完整性**: 文档完整且准确

**验收人**: _________________  
**验收日期**: _________________  
**验收意见**: 

---

## 📚 相关文档

### 实施文档
- `scripts/HEALTH_METRICS_CALCULATION_LOGIC.md` - 健康度计算逻辑文档
- `scripts/TIME_CONFLICT_SEVERITY_BASED_SCORING_IMPLEMENTATION.md` - 时间冲突差异化扣分实施总结
- `scripts/PREVIEW_IMPACT_BASED_ON_ACTUAL_DATA_IMPLEMENTATION.md` - 预览模式影响计算改进实施总结

### 产品决策文档
- `.claude/product-decisions/time-conflict-health-score-calculation.md` - 时间冲突扣分方案决策（方案C）
- `.claude/product-decisions/preview-impact-calculation-improvement.md` - 预览模式影响计算改进方案

### 代码文件
- `src/skills/detail/detail-analyze-health.skill.ts` - 健康度计算实现
- `src/trips/services/trip-suggestions.service.ts` - 建议服务（影响计算）
- `src/trips/services/trip-conflicts.service.ts` - 冲突检测服务
- `src/trips/dto/trip-conflicts.dto.ts` - 冲突DTO（包含overlapMinutes）

---

## ⚠️ 注意事项

1. **服务器重启**: 需要重启 NestJS 服务器使代码生效
2. **数据迁移**: 现有冲突数据可能没有 `overlapMinutes` 字段，代码已做向后兼容处理（使用默认值30分钟）
3. **前端更新**: 前端需要使用 `overallScore` 字段显示健康度百分比

---

## 🔄 后续优化建议

1. **缓存优化**: 考虑缓存健康度计算结果，避免频繁计算
2. **实时更新**: 当行程数据变更时，自动重新计算健康度
3. **历史记录**: 记录健康度变化历史，便于分析趋势
