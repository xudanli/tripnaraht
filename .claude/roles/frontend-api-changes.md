# 前端接口变更说明

**更新时间**：2026-01-26  
**变更类型**：功能增强（无接口变更）

---

## 📋 总结

**✅ 前端接口没有变化**，所有修复都是后端实现层面的改进。现有前端代码无需修改即可使用新功能。

---

## 🔍 详细说明

### 1. `POST /trip-planner/apply-suggestion` 接口

**状态**：✅ 无变化

**接口定义**：
```typescript
POST /trip-planner/apply-suggestion
Body: ApplySuggestionDto {
  tripId: string;
  sessionId: string;
  suggestionId: string;
  targetDay: number;
  timeSlot?: { start: string; end: string };  // 可选
  suggestionType: 'add_place' | 'modify_time' | 'add_meal' | 'optimize_route';
  place?: SuggestionPlaceDto;  // add_place 时必填
}
```

**改进内容**：
- ✅ **`modify_time` 类型现在可以正常工作**（之前返回"功能即将推出"）
- ✅ 当 `suggestionType: 'modify_time'` 时：
  - 如果提供 `timeSlot.start`，使用指定时间
  - 如果不提供，自动调整为 08:00（如果原时间 < 06:00）
  - 自动调整后续行程项以避免时间冲突

**前端使用示例**：
```typescript
// 接受 Abu 的"起太早"建议，自动调整时间
await fetch('/trip-planner/apply-suggestion', {
  method: 'POST',
  body: JSON.stringify({
    tripId: 'xxx',
    sessionId: 'xxx',
    suggestionId: 'abu_early_start_day1',
    targetDay: 1,
    suggestionType: 'modify_time',
    // timeSlot 可选，不提供则自动调整为 08:00
  })
});
```

**返回格式**（无变化）：
```typescript
{
  success: true,
  message: "已将「斯卡夫塔山国家公园」的开始时间从 01:00 调整为 08:00",
  item: {
    id: "item_xxx",
    tripDayId: "day_001",
    startTime: "2026-01-26T08:00:00.000Z",
    endTime: "2026-01-26T10:00:00.000Z",
    type: "ACTIVITY"
  },
  tripUpdate: {
    totalChanges: 2,  // 可能调整了多个行程项
    modifiedItems: 2,
    affectedDays: [1]
  }
}
```

---

### 2. `POST /trip-planner/chat` 接口

**状态**：✅ 无变化

**接口定义**：
```typescript
POST /trip-planner/chat
Body: TripPlannerChatDto {
  sessionId?: string;
  tripId: string;
  userId: string;
  message: string;
  targetDay?: number;
  targetItemId?: string;
  context?: {...};
}
```

**改进内容**：
- ✅ **`handleFillFreeTime` 响应消息更丰富**（主动推荐活动）
- ✅ 当用户说"填充空闲时间"时，系统会：
  - 自动分析空闲时间段
  - 根据时间段类型（早餐/午餐/晚餐/活动）推荐相应活动
  - 基于当天已有行程智能推荐互补活动
  - 直接展示推荐列表，而不是只询问

**响应格式**（无变化）：
```typescript
{
  success: true,
  data: {
    sessionId: "xxx",
    message: "我找到了以下空闲时间段，并为您推荐了活动：\n\n📅 **第1天 14:00-16:00**（120分钟空闲）\n💡 **推荐活动**：\n   1. 特色体验活动（丰富行程内容）\n   2. 当地文化体验（深入了解当地）\n   3. 休闲场所（放松休息）\n\n需要我帮您添加到行程中吗？",
    phase: "DETAILING",
    intent: "FILL_FREE_TIME",
    quickActions: [
      { id: '1', label: '✨ 自动填充推荐', action: 'AUTO_FILL', style: 'primary' },
      { id: '2', label: '🎯 我来选择', action: 'MANUAL_SELECT', style: 'secondary' },
      { id: '3', label: '😌 保持空闲', action: 'KEEP_FREE', style: 'secondary' }
    ]
  }
}
```

---

### 3. 三人格洞察（Abu）的时间提示

**状态**：✅ 无变化（但准确性提升）

**改进内容**：
- ✅ **时间解析更准确**：Abu 提示的开始时间现在与实际行程项显示的时间一致
- ✅ 使用统一的时间标准化逻辑，避免时区或格式问题导致的误报
- ✅ 如果检测到时间异常，会在提示中显示原始时间和标准化时间（用于调试）

**前端显示**：
- Abu 的提示时间现在应该与行程项显示的时间一致
- 如果之前出现"01:00太早"但实际显示"09:00"的情况，现在应该修复了

---

## 🎯 前端需要关注的点

### 1. `modify_time` 建议类型现在可用

**之前**：
- 点击"接受建议"后，返回"时间修改功能即将推出"
- 时间不会调整

**现在**：
- 点击"接受建议"后，时间自动调整
- 如果调整了多个行程项，`tripUpdate.modifiedItems` 会反映实际调整数量
- 前端需要刷新行程显示，以反映新的时间

**建议前端处理**：
```typescript
// 接受建议后，刷新行程数据
const result = await applySuggestion({...});
if (result.success && result.tripUpdate?.modifiedItems > 0) {
  // 刷新行程显示
  await refreshTripData(result.tripId);
  // 显示成功提示
  showNotification(`已调整 ${result.tripUpdate.modifiedItems} 个行程项的时间`);
}
```

### 2. 填充空闲时间的响应更丰富

**之前**：
- 只显示空闲时间段，询问是否需要推荐

**现在**：
- 直接显示推荐活动列表
- 推荐内容更具体（包含推荐理由）

**前端显示建议**：
- 可以解析 `message` 中的推荐列表，以更友好的方式展示
- 或者保持原样显示消息文本（已包含格式化内容）

### 3. 时间一致性

**改进**：
- Abu 提示的时间现在应该与行程项显示的时间一致
- 如果之前出现不一致的情况，现在应该修复了

**前端验证**：
- 检查 Abu 提示的时间是否与行程项时间一致
- 如果仍有不一致，可能是数据源问题，需要进一步排查

---

## 📝 测试建议

### 1. 测试时间调整功能

```typescript
// 测试场景：Abu 提示"第1天01:00开始可能太早"
// 1. 点击"接受建议"
// 2. 检查返回结果
// 3. 验证行程项时间是否已调整为 08:00
// 4. 验证后续行程项是否也相应调整
```

### 2. 测试填充空闲时间

```typescript
// 测试场景：用户说"帮我填充空闲时间"
// 1. 发送消息
// 2. 检查响应是否包含推荐活动列表
// 3. 验证推荐活动是否合理（根据时间段类型）
```

### 3. 测试时间一致性

```typescript
// 测试场景：检查 Abu 提示时间与行程项时间是否一致
// 1. 查看行程项显示的开始时间（如 09:00）
// 2. 检查 Abu 是否提示"09:00开始可能太早"（而不是 01:00）
```

---

## ✅ 总结

- **接口定义**：无变化
- **请求参数**：无变化
- **响应格式**：无变化
- **功能改进**：
  1. `modify_time` 建议类型现在可以正常工作
  2. 填充空闲时间时会主动推荐活动
  3. 时间解析更准确，Abu 提示时间与实际时间一致

**前端无需修改代码**，但建议：
1. 测试 `modify_time` 建议的接受功能
2. 验证时间调整后是否正确刷新显示
3. 检查时间一致性是否已修复
