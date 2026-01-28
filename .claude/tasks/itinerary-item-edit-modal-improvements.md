# 编辑行程项弹窗优化任务

> 创建时间：2026-01-28
> 优先级：P1（用户体验关键路径）
> 关联模块：前端弹窗组件 + 后端 API

---

## 背景

用户编辑行程项时，当前弹窗存在以下产品问题：
1. 警告与提示信息语义矛盾
2. 行程类型识别不准确
3. 按钮文案不支持"确认"语义
4. 缺少级联影响的具体展示
5. 时间跨天无明显标注

---

## 任务清单

### Task 1: 统一警告与提示语义 [后端]

**优先级**: P0
**负责**: 后端

**当前问题**:
- 红色警告说"确认继续？"
- 蓝色提示说"系统自动调整"
- 用户困惑：到底是自动还是需要确认？

**解决方案**:
修改 `src/itinerary-items/itinerary-items.controller.ts` 中的响应结构

```typescript
// 返回结构增加明确字段
{
  success: false,
  error: {
    code: 'REQUIRES_CONFIRMATION',
    message: '修改时间将影响后续行程安排',
    requiresConfirmation: true,
  },
  cascadeImpact: {
    affectedCount: 1,
    affectedItems: [
      {
        id: 'xxx',
        name: '黄金瀑布',
        originalTime: { start: '09:00', end: '11:00' },
        adjustedTime: { start: '14:00', end: '16:00' },
        timeDelta: '+5小时',
      }
    ],
    autoAdjust: true,  // 明确告知会自动调整
  },
}
```

**验收标准**:
- [ ] API 返回 `cascadeImpact.affectedItems` 包含受影响项详情
- [ ] API 返回 `cascadeImpact.autoAdjust` 明确告知是否自动调整

---

### Task 2: 前端展示级联影响详情 [前端]

**优先级**: P0
**负责**: 前端

**当前问题**:
- 只说"影响后续 1 个行程项"
- 不知道是哪个、会怎么调整

**解决方案**:
```tsx
// 警告区域改为详情展示
<Alert type="warning">
  <div>修改时间将影响后续行程安排：</div>
  <CascadeImpactList>
    {cascadeImpact.affectedItems.map(item => (
      <ImpactItem key={item.id}>
        <Icon>📍</Icon>
        <Name>{item.name}</Name>
        <TimeChange>
          {item.originalTime.start} → {item.adjustedTime.start}
          <Delta>({item.timeDelta})</Delta>
        </TimeChange>
      </ImpactItem>
    ))}
  </CascadeImpactList>
</Alert>
```

**验收标准**:
- [ ] 展示每个受影响行程项的名称
- [ ] 展示原时间和调整后时间
- [ ] 展示时间变化幅度

---

### Task 3: 行程类型自动识别 [后端]

**优先级**: P1
**负责**: 后端

**当前问题**:
- 黑沙滩套房酒店显示为"休息"类型
- 应自动识别为"住宿"

**解决方案**:
在 `src/itinerary-items/itinerary-items.service.ts` 中添加类型推断逻辑

```typescript
private inferItemType(place: Place, dto: CreateItineraryItemDto): ItineraryItemType {
  // 1. 用户明确指定 → 使用用户指定
  if (dto.type) return dto.type;
  
  // 2. 根据 Place 类别推断
  const category = place.category?.toLowerCase();
  if (category?.includes('hotel') || category?.includes('住宿') || category?.includes('酒店')) {
    return 'HOTEL';
  }
  if (category?.includes('restaurant') || category?.includes('餐')) {
    return 'RESTAURANT';
  }
  
  // 3. 根据名称推断
  const name = (place.nameCN || place.nameEN || '').toLowerCase();
  if (name.includes('酒店') || name.includes('hotel') || name.includes('套房')) {
    return 'HOTEL';
  }
  
  // 4. 默认
  return 'ACTIVITY';
}
```

**验收标准**:
- [ ] 酒店/住宿类 Place 自动识别为 HOTEL 类型
- [ ] 餐厅类 Place 自动识别为 RESTAURANT 类型
- [ ] 用户手动指定类型时优先使用用户指定

---

### Task 4: 动态按钮文案 [前端]

**优先级**: P1
**负责**: 前端

**当前问题**:
- 警告说"确认继续？"，按钮却是"保存"
- 语义不一致

**解决方案**:
```tsx
// 根据是否有级联影响动态渲染按钮
<DialogActions>
  <Button onClick={onCancel}>取消</Button>
  {hasCascadeImpact ? (
    <Button 
      variant="primary" 
      onClick={onConfirmWithCascade}
    >
      确认并调整后续
    </Button>
  ) : (
    <Button 
      variant="primary" 
      onClick={onSave}
    >
      保存
    </Button>
  )}
</DialogActions>
```

**验收标准**:
- [ ] 无级联影响时，按钮显示"保存"
- [ ] 有级联影响时，按钮显示"确认并调整后续"
- [ ] 点击确认按钮自动带上 `forceCreate: true` 参数

---

### Task 5: 时间跨天标注 [前端]

**优先级**: P2
**负责**: 前端

**当前问题**:
- 开始 01/26 18:00，结束 01/27 12:00
- 没有明确标注"跨天"

**解决方案**:
```tsx
// 时间选择器组件
<DateTimePicker
  label="结束时间"
  value={endTime}
  renderSuffix={() => {
    const daysDiff = getDaysDiff(startTime, endTime);
    if (daysDiff > 0) {
      return <Tag color="blue">+{daysDiff}天</Tag>;
    }
    return null;
  }}
/>
```

**验收标准**:
- [ ] 结束时间跨天时显示 "+1天" 标签
- [ ] 跨多天时显示 "+N天"
- [ ] 同一天时不显示标签

---

### Task 6: 住宿类型时间标签优化 [前端]

**优先级**: P2
**负责**: 前端

**当前问题**:
- 住宿类型显示"开始时间/结束时间"
- 应该显示"入住时间/退房时间"

**解决方案**:
```tsx
const getTimeLabels = (itemType: string) => {
  switch (itemType) {
    case 'HOTEL':
      return { start: '入住时间', end: '退房时间' };
    case 'RESTAURANT':
      return { start: '用餐时间', end: '结束时间' };
    case 'TRANSPORT':
      return { start: '出发时间', end: '到达时间' };
    default:
      return { start: '开始时间', end: '结束时间' };
  }
};
```

**验收标准**:
- [ ] 住宿类型显示"入住时间/退房时间"
- [ ] 餐厅类型显示"用餐时间"
- [ ] 交通类型显示"出发时间/到达时间"

---

## 开发顺序建议

```
Phase 1 (P0 - 本周):
  Task 1 (后端) → Task 2 (前端) → Task 4 (前端)
  
Phase 2 (P1 - 下周):
  Task 3 (后端)
  
Phase 3 (P2 - 后续):
  Task 5 (前端) → Task 6 (前端)
```

---

## 相关文件

**后端**:
- `src/itinerary-items/itinerary-items.controller.ts` - 主控制器
- `src/itinerary-items/itinerary-items.service.ts` - 业务逻辑
- `src/itinerary-items/validators/*.ts` - 校验器

**前端** (需确认路径):
- 编辑弹窗组件
- 时间选择器组件

---

## 备注

- Task 1 后端改动已部分完成（错误消息已优化）
- 前端需要配合更新以支持新的响应结构
- 建议前后端同步开发，避免接口不兼容
