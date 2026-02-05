# 管理端路线模板时间字段使用指南

## 概述

路线模板中的 POI 现在支持 `startTime` 和 `endTime` 字段来指定具体的时间。创建行程时，如果模板中提供了时间，将优先使用模板中的时间；否则会根据交通时间自动计算。

## 重要说明

- **模板中的时间**：`startTime` 和 `endTime` 字段控制 POI 的具体时间
- **创建行程时的行为**：如果模板提供了时间，直接使用；否则根据交通时间自动计算
- **排序规则**：行程项统一按 `startTime` 排序，不再使用 `order` 字段

---

## API 接口

### 1. 获取路线模板详情

**接口**: `GET /route-directions/templates/:id`

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nameCN": "7天冰岛环岛",
    "dayPlans": [
      {
        "day": 1,
        "theme": "抵达雷克雅未克",
        "pois": [
          {
            "id": 123,
            "nameCN": "雷克雅未克大教堂",
            "startTime": "09:00",
            "endTime": "10:00",
            "required": true,
            "durationMinutes": 60
          },
          {
            "id": 456,
            "nameCN": "蓝湖温泉",
            "startTime": "14:00",
            "endTime": "17:00",
            "required": true,
            "durationMinutes": 180
          }
        ]
      }
    ]
  }
}
```

**说明**:
- `dayPlans[].pois[]` 中的 `startTime` 和 `endTime` 字段指定 POI 的具体时间
- 后端返回时已按 `startTime` 排序

---

### 2. 更新路线模板（批量更新 POI 顺序）

**接口**: `PUT /route-directions/templates/:id`

**请求体**:
```json
{
  "dayPlans": [
    {
      "day": 1,
      "theme": "抵达雷克雅未克",
      "pois": [
        {
          "id": 123,
          "nameCN": "雷克雅未克大教堂",
          "startTime": "09:00",
          "endTime": "10:00"
        },
        {
          "id": 456,
          "nameCN": "蓝湖温泉",
          "startTime": "14:00",
          "endTime": "17:00"
        },
        {
          "id": 789,
          "nameCN": "哈帕音乐厅",
          "startTime": "18:00",
          "endTime": "19:30"
        }
      ]
    }
  ]
}
```

**说明**:
- 可以一次性更新整个 `dayPlans` 数组
- 更新 `pois` 数组中的 `startTime` 和 `endTime` 来指定时间
- 时间格式支持 ISO 8601（如 `"2024-05-01T09:00:00.000Z"`）或 HH:mm（如 `"09:00"`）

**示例代码**:
```typescript
// 重排第1天的 POI 顺序
async function reorderTemplatePois(templateId: number, day: number, newTimes: Array<{ startTime: string; endTime: string }>) {
  // 1. 获取当前模板
  const template = await fetch(`/route-directions/templates/${templateId}`).then(r => r.json());
  
  // 2. 找到对应的 dayPlan
  const dayPlan = template.data.dayPlans.find((p: any) => p.day === day);
  
  // 3. 更新时间值
  dayPlan.pois.forEach((poi: any, index: number) => {
    if (newTimes[index]) {
      poi.startTime = newTimes[index].startTime;
      poi.endTime = newTimes[index].endTime;
    }
  });
  
  // 4. 更新模板
  await fetch(`/route-directions/templates/${templateId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dayPlans: template.data.dayPlans
    })
  });
}
```

---

### 3. 添加 POI 到模板（指定时间）

**接口**: `POST /route-directions/templates/:id/pois`

**请求体**:
```json
{
  "day": 1,
  "poiId": 123,
  "startTime": "09:00",
  "endTime": "10:00",
  "priority": "HIGH",
  "durationMinutes": 60
}
```

**说明**:
- `startTime`: 可选，开始时间（ISO 8601 或 HH:mm 格式）
- `endTime`: 可选，结束时间（ISO 8601 或 HH:mm 格式）
- 如果提供了 `startTime` 和 `endTime`，创建行程时将直接使用这些时间
- 如果只提供了 `durationMinutes`，系统会根据交通时间自动计算时间

**示例**:
```typescript
// 在第1天的指定时间添加 POI
await fetch(`/route-directions/templates/1/pois`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    day: 1,
    poiId: 123,
    startTime: "14:00",  // 指定开始时间
    endTime: "16:00",   // 指定结束时间
    priority: 'HIGH'
  })
});
```

---

### 4. 更新模板中的 POI（修改时间）

**接口**: `PATCH /route-directions/templates/:id/pois`

**请求体**:
```json
{
  "day": 1,
  "poiId": 123,
  "startTime": "14:00",
  "endTime": "16:00"
}
```

**说明**:
- 可以单独更新某个 POI 的 `startTime` 和 `endTime`
- 时间格式支持 ISO 8601 或 HH:mm

**示例**:
```typescript
// 将 POI 123 移动到第3个位置
await fetch(`/route-directions/templates/1/pois`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    day: 1,
    poiId: 123,
    order: 3
  })
});
```

---

### 5. 批量更新 POI 优先级（不影响 order）

**接口**: `PATCH /route-directions/templates/:id/pois/bulk-priority`

**请求体**:
```json
{
  "updates": [
    { "day": 1, "poiId": 123, "priority": "MUST_SEE" },
    { "day": 1, "poiId": 456, "priority": "HIGH" }
  ]
}
```

**说明**:
- 此接口只更新 `priority`，不更新 `order`
- 如果需要同时更新 `order`，使用 `PUT /route-directions/templates/:id`

---

## 前端实现示例

### 拖拽重排 POI

```typescript
/**
 * 重排模板中的 POI（通过调整时间）
 * @param templateId 模板 ID
 * @param day 第几天
 * @param draggedPoiId 被拖拽的 POI ID
 * @param newIndex 新位置索引
 */
async function reorderTemplatePois(
  templateId: number,
  day: number,
  draggedPoiId: number,
  newIndex: number
) {
  // 1. 获取当前模板
  const response = await fetch(`/route-directions/templates/${templateId}`);
  const result = await response.json();
  const template = result.data;
  
  // 2. 找到对应的 dayPlan
  const dayPlan = template.dayPlans.find((p: any) => p.day === day);
  if (!dayPlan || !dayPlan.pois) {
    throw new Error(`Day ${day} not found or has no POIs`);
  }
  
  // 3. 找到被拖拽的 POI
  const draggedPoiIndex = dayPlan.pois.findIndex((p: any) => p.id === draggedPoiId);
  if (draggedPoiIndex === -1) {
    throw new Error(`POI ${draggedPoiId} not found`);
  }
  
  // 4. 重新排序数组
  const [draggedPoi] = dayPlan.pois.splice(draggedPoiIndex, 1);
  dayPlan.pois.splice(newIndex, 0, draggedPoi);
  
  // 5. 🆕 重新分配时间（根据新位置）
  // 假设每天从 09:00 开始，每个 POI 间隔 1 小时
  const baseHour = 9; // 9:00 开始
  dayPlan.pois.forEach((poi: any, index: number) => {
    const startHour = baseHour + index * 2; // 每2小时一个POI
    const duration = poi.durationMinutes || 60; // 默认1小时
    const endHour = startHour + Math.ceil(duration / 60);
    
    poi.startTime = `${String(startHour).padStart(2, '0')}:00`;
    poi.endTime = `${String(endHour).padStart(2, '0')}:00`;
  });
  
  // 6. 更新模板
  await fetch(`/route-directions/templates/${templateId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dayPlans: template.dayPlans
    })
  });
}
```

### React 拖拽示例

```tsx
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

function TemplatePoiList({ templateId, day }: { templateId: number; day: number }) {
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);

  useEffect(() => {
    fetchTemplate(templateId).then(template => {
      const plan = template.dayPlans.find(p => p.day === day);
      setDayPlan(plan || null);
    });
  }, [templateId, day]);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !dayPlan) return;

    const newPois = Array.from(dayPlan.pois || []);
    const [reorderedPoi] = newPois.splice(result.source.index, 1);
    newPois.splice(result.destination.index, 0, reorderedPoi);

    // 🆕 重新分配时间（根据新位置）
    const baseHour = 9; // 9:00 开始
    newPois.forEach((poi: any, index: number) => {
      const startHour = baseHour + index * 2;
      const duration = poi.durationMinutes || 60;
      const endHour = startHour + Math.ceil(duration / 60);
      poi.startTime = `${String(startHour).padStart(2, '0')}:00`;
      poi.endTime = `${String(endHour).padStart(2, '0')}:00`;
    });

    // 乐观更新
    setDayPlan({ ...dayPlan, pois: newPois });

    // 更新后端
    try {
      await reorderTemplatePois(templateId, day, reorderedPoi.id!, result.destination.index);
    } catch (error) {
      // 回滚
      setDayPlan(dayPlan);
      alert('重排失败，请重试');
    }
  };

  if (!dayPlan) return <div>Loading...</div>;

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId={`day-${day}-pois`}>
        {(provided) => (
          <div {...provided.droppableProps} ref={provided.innerRef}>
            {dayPlan.pois?.map((poi, index) => (
              <Draggable key={poi.id || poi.uuid} draggableId={String(poi.id || poi.uuid)} index={index}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <PoiCard poi={poi} startTime={poi.startTime} endTime={poi.endTime} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
```

---

## 注意事项

### 1. 时间格式

- **ISO 8601 格式**：`"2024-05-01T09:00:00.000Z"`（完整日期时间）
- **HH:mm 格式**：`"09:00"`（仅时间，会结合行程日期）
- **推荐使用 HH:mm**：更简洁，系统会自动结合行程日期

### 2. 时间优先级

创建行程时的优先级：
1. **模板中的 `startTime` 和 `endTime`**（如果提供）
2. **模板中的 `durationMinutes`** + 交通时间计算
3. **默认 slot 时间**（morning: 9:00-12:00, lunch: 12:00-14:00 等）

### 3. 排序规则

- **模板中的 POI**：按 `startTime` 排序（如果提供），否则按数组顺序
- **创建的行程项**：统一按 `startTime` 排序
- **不再使用 `order` 字段**：所有排序都基于时间

### 4. 创建行程时的行为

当从模板创建行程时：
- 如果模板 POI 提供了 `startTime` 和 `endTime`，直接使用
- 如果只提供了 `durationMinutes`，根据前一个行程项的结束时间和交通时间计算
- 如果都没有提供，使用默认的 slot 时间

### 5. 兼容性

- **旧模板**：如果模板中的 POI 没有时间字段，会使用计算逻辑（考虑交通时间）
- **向后兼容**：支持没有时间字段的旧模板

---

## 最佳实践

### 1. 设置时间字段

创建新模板或添加 POI 时，建议明确设置 `startTime` 和 `endTime`：

```typescript
// ✅ 推荐：明确设置时间
const dayPlan = {
  day: 1,
  pois: [
    { id: 123, nameCN: "景点A", startTime: "09:00", endTime: "10:00" },
    { id: 456, nameCN: "景点B", startTime: "14:00", endTime: "16:00" },
    { id: 789, nameCN: "景点C", startTime: "18:00", endTime: "19:30" }
  ]
};

// ⚠️ 也可以只设置 durationMinutes，系统会自动计算时间
const dayPlan = {
  day: 1,
  pois: [
    { id: 123, nameCN: "景点A", durationMinutes: 60 },  // 时间会根据交通时间计算
    { id: 456, nameCN: "景点B", durationMinutes: 120 }
  ]
};
```

### 2. 批量重排

如果需要重排多个 POI，建议一次性更新整个 `dayPlans`：

```typescript
// ✅ 推荐：批量更新
await fetch(`/route-directions/templates/${templateId}`, {
  method: 'PUT',
  body: JSON.stringify({
    dayPlans: updatedDayPlans  // 包含所有天的完整数据，已更新 startTime 和 endTime
  })
});

// ⚠️ 不推荐：逐个更新
for (const poi of pois) {
  await fetch(`/route-directions/templates/${templateId}/pois`, {
    method: 'PATCH',
    body: JSON.stringify({ 
      day: 1, 
      poiId: poi.id, 
      startTime: poi.startTime,
      endTime: poi.endTime
    })
  });
}
```

### 3. 验证时间值

更新前建议验证时间值的有效性：

```typescript
function validatePoiTimes(pois: DayPlanPoi[]): boolean {
  for (const poi of pois) {
    if (poi.startTime && poi.endTime) {
      const start = new Date(`2000-01-01T${poi.startTime}:00`);
      const end = new Date(`2000-01-01T${poi.endTime}:00`);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.warn(`Invalid time format for POI ${poi.id}:`, poi.startTime, poi.endTime);
        return false;
      }
      
      if (start >= end) {
        console.warn(`Start time must be before end time for POI ${poi.id}`);
        return false;
      }
    }
  }
  
  return true;
}
```

---

## 相关接口文档

- [路线模板 API 文档](./ROUTE_TEMPLATE_API.md)
- [路线模板 CRUD 接口](./ROUTE_CRUD_API.md)
- [前端 API 对接文档](./FRONTEND_API.md)

---

---

## 总结

### 主要变更

1. **移除 `order` 字段**：不再使用 `order` 字段控制顺序
2. **新增时间字段**：路线模板中的 POI 支持 `startTime` 和 `endTime` 字段
3. **统一按时间排序**：所有行程项统一按 `startTime` 排序
4. **优先使用模板时间**：创建行程时，如果模板提供了时间，直接使用；否则自动计算

### 时间优先级

创建行程时的时间优先级：
1. 模板中的 `startTime` 和 `endTime`（最高优先级）
2. 模板中的 `durationMinutes` + 交通时间计算
3. 默认 slot 时间（morning: 9:00-12:00 等）

---

**最后更新**: 2026-02-04
