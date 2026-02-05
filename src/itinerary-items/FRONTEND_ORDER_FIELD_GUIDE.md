# 前端使用行程项时间排序指南

## 概述

行程项（ItineraryItem）现在统一按 `startTime`（开始时间）排序显示。不再使用 `order` 字段，所有排序都基于时间。

## API 返回的数据结构

### 获取行程项列表

**接口**: `GET /api/itinerary-items?tripDayId={tripDayId}`

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "item-1",
      "startTime": "2024-05-01T09:00:00.000Z",
      "endTime": "2024-05-01T12:00:00.000Z",
      "type": "ACTIVITY",
      "placeId": 123,
      "note": "参观博物馆",
      "Place": { ... }
    },
    {
      "id": "item-2",
      "startTime": "2024-05-01T12:00:00.000Z",
      "endTime": "2024-05-01T13:30:00.000Z",
      "type": "MEAL_ANCHOR",
      "placeId": 456,
      "note": "午餐",
      "Place": { ... }
    }
  ]
}
```

**注意**: 后端已经按 `startTime` 排序返回，前端可以直接使用，无需再次排序。

### 获取行程详情（包含行程项）

**接口**: `GET /api/trips/{tripId}`

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "trip-1",
    "TripDay": [
      {
        "id": "day-1",
        "date": "2024-05-01T00:00:00.000Z",
        "ItineraryItem": [
          {
            "id": "item-1",
            "startTime": "2024-05-01T09:00:00.000Z",
            "endTime": "2024-05-01T12:00:00.000Z",
            ...
          },
          {
            "id": "item-2",
            "startTime": "2024-05-01T12:00:00.000Z",
            "endTime": "2024-05-01T13:30:00.000Z",
            ...
          }
        ]
      }
    ]
  }
}
```

## 前端使用方式

### 1. 显示行程项（自动排序）

后端已经按照 `startTime` 排序返回数据，前端可以直接使用：

```typescript
// 获取行程项列表
async function fetchItineraryItems(tripDayId: string) {
  const response = await fetch(`/api/itinerary-items?tripDayId=${tripDayId}`);
  const result = await response.json();
  
  if (result.success) {
    // 后端已经按 startTime 排序，直接使用
    const items = result.data;
    renderItineraryItems(items);
  }
}
```

### 2. 手动调整时间（拖拽重排）

如果前端需要支持拖拽重排，需要更新 `startTime` 和 `endTime` 字段：

```typescript
// 更新行程项的时间
async function updateItemTime(
  itemId: string, 
  newStartTime: string,  // ISO 8601 格式
  newEndTime: string      // ISO 8601 格式
) {
  const response = await fetch(`/api/itinerary-items/${itemId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      startTime: newStartTime,
      endTime: newEndTime,
    }),
  });

  const result = await response.json();
  if (result.success) {
    // 重新获取列表以获取更新后的顺序
    await refreshItineraryItems(tripDayId);
  }
}
```

### 3. 批量重排（拖拽多个项目）

当用户拖拽一个项目到新位置时，需要更新多个项目的时间：

```typescript
/**
 * 重排行程项（通过调整时间）
 * @param items 所有行程项（已按当前 startTime 排序）
 * @param draggedItemId 被拖拽的项目 ID
 * @param newIndex 新位置索引
 */
async function reorderItems(
  items: ItineraryItem[],
  draggedItemId: string,
  newIndex: number
) {
  const draggedItem = items.find(item => item.id === draggedItemId);
  if (!draggedItem) return;

  const oldIndex = items.findIndex(item => item.id === draggedItemId);
  
  // 如果位置没变，不需要更新
  if (oldIndex === newIndex) return;

  // 🆕 计算新的时间
  const updates: Array<{ id: string; startTime: string; endTime: string }> = [];
  
  // 获取被拖拽项目的持续时间
  const draggedDuration = new Date(draggedItem.endTime).getTime() - 
                          new Date(draggedItem.startTime).getTime();
  
  if (newIndex === 0) {
    // 移动到最前面：使用第一个项目的时间，但提前一些
    const firstItem = items[0];
    const firstStartTime = new Date(firstItem.startTime);
    const newStartTime = new Date(firstStartTime.getTime() - draggedDuration - 60 * 60 * 1000); // 提前1小时
    const newEndTime = new Date(newStartTime.getTime() + draggedDuration);
    
    updates.push({
      id: draggedItemId,
      startTime: newStartTime.toISOString(),
      endTime: newEndTime.toISOString(),
    });
  } else if (newIndex === items.length - 1) {
    // 移动到最后面：使用最后一个项目的时间，但延后一些
    const lastItem = items[items.length - 1];
    const lastEndTime = new Date(lastItem.endTime);
    const newStartTime = new Date(lastEndTime.getTime() + 60 * 60 * 1000); // 延后1小时
    const newEndTime = new Date(newStartTime.getTime() + draggedDuration);
    
    updates.push({
      id: draggedItemId,
      startTime: newStartTime.toISOString(),
      endTime: newEndTime.toISOString(),
    });
  } else {
    // 移动到中间位置：插入到前后两个项目之间
    const prevItem = items[newIndex - 1];
    const nextItem = items[newIndex];
    const prevEndTime = new Date(prevItem.endTime);
    const nextStartTime = new Date(nextItem.startTime);
    
    // 计算中间时间
    const gap = nextStartTime.getTime() - prevEndTime.getTime();
    if (gap >= draggedDuration + 30 * 60 * 1000) {
      // 有足够空间，插入中间
      const newStartTime = new Date(prevEndTime.getTime() + 30 * 60 * 1000); // 前一个结束后30分钟
      const newEndTime = new Date(newStartTime.getTime() + draggedDuration);
      
      updates.push({
        id: draggedItemId,
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
      });
    } else {
      // 空间不足，调整前后项目的时间
      const newStartTime = prevEndTime;
      const newEndTime = new Date(newStartTime.getTime() + draggedDuration);
      
      updates.push({
        id: draggedItemId,
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
      });
      
      // 调整后续项目的时间
      let currentTime = newEndTime;
      for (let i = newIndex; i < items.length; i++) {
        if (items[i].id === draggedItemId) continue;
        
        const itemDuration = new Date(items[i].endTime).getTime() - 
                            new Date(items[i].startTime).getTime();
        const itemStartTime = new Date(currentTime.getTime() + 30 * 60 * 1000); // 间隔30分钟
        const itemEndTime = new Date(itemStartTime.getTime() + itemDuration);
        
        updates.push({
          id: items[i].id,
          startTime: itemStartTime.toISOString(),
          endTime: itemEndTime.toISOString(),
        });
        
        currentTime = itemEndTime;
      }
    }
  }

  // 批量更新
  await Promise.all(
    updates.map(update =>
      fetch(`/api/itinerary-items/${update.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          startTime: update.startTime,
          endTime: update.endTime,
        }),
      })
    )
  );

  // 重新获取列表
  await refreshItineraryItems(tripDayId);
}
```

### 4. React 示例（使用 react-beautiful-dnd）

```tsx
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

function ItineraryItemsList({ tripDayId }: { tripDayId: string }) {
  const [items, setItems] = useState<ItineraryItem[]>([]);

  useEffect(() => {
    fetchItineraryItems(tripDayId).then(setItems);
  }, [tripDayId]);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const newItems = Array.from(items);
    const [reorderedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, reorderedItem);

    // 乐观更新 UI（临时排序）
    setItems(newItems);

    // 🆕 更新后端时间
    try {
      await reorderItems(items, reorderedItem.id, result.destination.index);
      // 重新获取以确保数据同步（后端会按 startTime 重新排序）
      const refreshedItems = await fetchItineraryItems(tripDayId);
      setItems(refreshedItems);
    } catch (error) {
      // 回滚 UI
      setItems(items);
      alert('重排失败，请重试');
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="itinerary-items">
        {(provided) => (
          <div {...provided.droppableProps} ref={provided.innerRef}>
            {items.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <ItineraryItemCard item={item} />
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

### 5. Vue 示例（使用 vuedraggable）

```vue
<template>
  <draggable
    v-model="items"
    :animation="200"
    handle=".drag-handle"
    @end="onDragEnd"
  >
    <ItineraryItemCard
      v-for="item in items"
      :key="item.id"
      :item="item"
    />
  </draggable>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import draggable from 'vuedraggable';

const props = defineProps<{ tripDayId: string }>();
const items = ref<ItineraryItem[]>([]);

onMounted(async () => {
  items.value = await fetchItineraryItems(props.tripDayId);
});

const onDragEnd = async () => {
  // 🆕 重新计算所有时间
  const baseHour = 9; // 9:00 开始
  const updates = items.value.map((item: any, index: number) => {
    const startHour = baseHour + index * 2; // 每2小时一个项目
    const duration = new Date(item.endTime).getTime() - new Date(item.startTime).getTime();
    const durationHours = Math.ceil(duration / (60 * 60 * 1000));
    const endHour = startHour + durationHours;
    
    return {
      id: item.id,
      startTime: new Date(`2000-01-01T${String(startHour).padStart(2, '0')}:00:00`).toISOString(),
      endTime: new Date(`2000-01-01T${String(endHour).padStart(2, '0')}:00:00`).toISOString(),
    };
  });

  // 批量更新
  await Promise.all(
    updates.map(update =>
      fetch(`/api/itinerary-items/${update.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          startTime: update.startTime,
          endTime: update.endTime,
        }),
      })
    )
  );
};
</script>
```

## 注意事项

### 1. 统一按时间排序

- **所有排序都基于 `startTime`**：后端统一按 `startTime` 排序返回
- **不再使用 `order` 字段**：已完全移除，前端无需处理
- **时间格式**：使用 ISO 8601 格式（如 `"2024-05-01T09:00:00.000Z"`）

### 2. 时间调整的级联效果

- **自动调整后续项目**：更新一个项目的 `startTime` 时，系统会自动调整后续项目的时间
- **级联模式**：可以通过 `cascadeMode` 参数控制是否自动调整后续项目
  - `auto`（默认）：自动调整后续项目
  - `none`：只调整当前项目，不影响后续

### 3. 跨天处理

- 每天的行程项独立排序，按当天的 `startTime` 排序
- 跨天时不需要考虑前一天的行程项

### 4. 性能优化建议

- **批量更新**：如果重排多个项目，建议批量更新而不是逐个更新
- **乐观更新**：先更新 UI，再同步到后端，失败时回滚
- **防抖处理**：拖拽过程中不要频繁调用 API，在拖拽结束后统一更新
- **使用级联模式**：如果调整一个项目会影响后续项目，使用 `cascadeMode: 'auto'` 让后端自动处理

### 5. 兼容性

- **旧数据**：旧的行程项可能没有时间字段，后端会使用默认时间
- **向后兼容**：前端代码如果之前使用 `order` 字段，需要迁移到使用 `startTime`

## API 更新

### 更新行程项时间

**接口**: `PATCH /api/itinerary-items/:id`

**请求体**:
```json
{
  "startTime": "2024-05-01T09:00:00.000Z",
  "endTime": "2024-05-01T12:00:00.000Z",
  "cascadeMode": "auto"  // 可选：auto（默认）或 none
}
```

**响应**: 标准响应格式，包含更新后的行程项数据

**说明**:
- `startTime` 和 `endTime` 都是可选的，可以只更新其中一个
- `cascadeMode` 控制是否自动调整后续项目的时间
- 如果更新了 `startTime`，系统会根据交通时间自动调整后续项目

## 迁移建议

如果现有前端代码使用 `order` 字段：

1. **移除所有 `order` 相关代码**：不再需要处理 `order` 字段
2. **使用 `startTime` 排序**：所有排序都基于 `startTime`
3. **更新拖拽重排逻辑**：改为更新 `startTime` 和 `endTime`，而不是 `order`
4. **利用级联调整**：使用 `cascadeMode: 'auto'` 让后端自动处理时间冲突

## 示例：完整的重排逻辑（使用时间）

```typescript
/**
 * 完整的重排逻辑（通过调整时间，处理边界情况）
 */
async function reorderItemsComplete(
  items: ItineraryItem[],
  draggedItemId: string,
  newIndex: number
) {
  const draggedItem = items.find(item => item.id === draggedItemId);
  if (!draggedItem) return;

  const oldIndex = items.findIndex(item => item.id === draggedItemId);
  if (oldIndex === newIndex) return;

  // 获取被拖拽项目的持续时间
  const draggedDuration = new Date(draggedItem.endTime).getTime() - 
                          new Date(draggedItem.startTime).getTime();
  
  const updates: Array<{ id: string; startTime: string; endTime: string; cascadeMode?: string }> = [];
  
  if (newIndex === 0) {
    // 移动到最前面：使用第一个项目的时间，但提前一些
    const firstItem = items[0];
    const firstStartTime = new Date(firstItem.startTime);
    const newStartTime = new Date(firstStartTime.getTime() - draggedDuration - 60 * 60 * 1000); // 提前1小时
    const newEndTime = new Date(newStartTime.getTime() + draggedDuration);
    
    updates.push({
      id: draggedItemId,
      startTime: newStartTime.toISOString(),
      endTime: newEndTime.toISOString(),
      cascadeMode: 'auto', // 自动调整后续项目
    });
  } else if (newIndex === items.length - 1) {
    // 移动到最后面：使用最后一个项目的时间，但延后一些
    const lastItem = items[items.length - 1];
    const lastEndTime = new Date(lastItem.endTime);
    const newStartTime = new Date(lastEndTime.getTime() + 60 * 60 * 1000); // 延后1小时
    const newEndTime = new Date(newStartTime.getTime() + draggedDuration);
    
    updates.push({
      id: draggedItemId,
      startTime: newStartTime.toISOString(),
      endTime: newEndTime.toISOString(),
    });
  } else {
    // 移动到中间位置：插入到前后两个项目之间
    const prevItem = items[newIndex - 1];
    const nextItem = items[newIndex];
    const prevEndTime = new Date(prevItem.endTime);
    const nextStartTime = new Date(nextItem.startTime);
    
    // 计算中间时间
    const gap = nextStartTime.getTime() - prevEndTime.getTime();
    if (gap >= draggedDuration + 30 * 60 * 1000) {
      // 有足够空间，插入中间
      const newStartTime = new Date(prevEndTime.getTime() + 30 * 60 * 1000); // 前一个结束后30分钟
      const newEndTime = new Date(newStartTime.getTime() + draggedDuration);
      
      updates.push({
        id: draggedItemId,
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
      });
    } else {
      // 空间不足，需要调整后续项目
      const newStartTime = prevEndTime;
      const newEndTime = new Date(newStartTime.getTime() + draggedDuration);
      
      updates.push({
        id: draggedItemId,
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
        cascadeMode: 'auto', // 自动调整后续项目
      });
    }
  }

  // 执行更新
  await Promise.all(
    updates.map(update =>
      fetch(`/api/itinerary-items/${update.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          startTime: update.startTime,
          endTime: update.endTime,
          cascadeMode: update.cascadeMode || 'auto',
        }),
      })
    )
  );
  
  // 重新获取列表以确保数据同步
  await refreshItineraryItems(tripDayId);
}
```

---

## 总结

### 主要变更

1. **移除 `order` 字段**：不再使用 `order` 字段控制顺序
2. **统一按时间排序**：所有行程项统一按 `startTime` 排序
3. **时间调整**：通过更新 `startTime` 和 `endTime` 来调整顺序
4. **级联调整**：支持自动调整后续项目的时间，避免时间冲突

### 使用建议

- **显示**：直接使用后端返回的数据，已按 `startTime` 排序
- **重排**：更新 `startTime` 和 `endTime`，使用 `cascadeMode: 'auto'` 自动处理后续项目
- **性能**：批量更新多个项目时，使用 `cascadeMode: 'auto'` 可以减少 API 调用次数

---

**最后更新**: 2026-02-04
