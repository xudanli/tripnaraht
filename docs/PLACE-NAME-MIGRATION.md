# Place 表名称字段迁移总结

## ✅ 已完成的迁移

### 1. Schema 层更新

**文件**: `prisma/schema.prisma`

将 `Place` 表的 `name` 字段改为 `nameCN`，并确保 `nameEN` 字段正确显示：

```prisma
model Place {
  id               Int                       @id @default(autoincrement())
  uuid             String                    @unique
  nameCN            String                    // 中文名称（主要显示）
  nameEN            String?                   // 英文名称（用于国际化）
  // ...
}
```

### 2. 数据库迁移

**文件**: `scripts/migrate-place-name-to-namecn.ts`

创建并执行了安全的数据迁移脚本：

1. ✅ 添加 `nameCN` 字段（允许 NULL）
2. ✅ 将现有的 `name` 数据复制到 `nameCN`
3. ✅ 将 `nameCN` 设为 NOT NULL
4. ✅ 删除旧的 `name` 字段

**迁移结果**：
- 成功迁移 **28,425** 条记录
- 所有记录的 `nameCN` 字段已填充
- `nameEN` 字段目前为空（待后续填充）

### 3. 代码更新

#### 3.1 DTO 层

**文件**: `src/places/dto/geo-result.dto.ts`

```typescript
export interface RawPlaceResult {
  nameCN: string;
  nameEN: string | null;
  // ...
}

export interface PlaceWithDistance {
  name: string; // 显示名称（优先 nameEN，否则 nameCN）
  nameCN: string;
  nameEN: string | null;
  // ...
}
```

**文件**: `src/places/dto/create-place.dto.ts`

```typescript
export class CreatePlaceDto {
  nameCN!: string; // 中文名称
  nameEN?: string; // 英文名称（可选）
  // ...
}
```

#### 3.2 服务层

**文件**: `src/places/places.service.ts`

- ✅ 更新了 SQL 查询，使用 `"nameCN"` 和 `"nameEN"` 字段
- ✅ `mapToDto()` 方法优先显示 `nameEN`，如果没有则使用 `nameCN`
- ✅ 更新了所有使用 `place.name` 的地方

**文件**: `src/places/services/hotel-recommendation.service.ts`

- ✅ 所有返回酒店名称的地方都使用 `hotel.nameEN || hotel.nameCN`

**文件**: `src/itinerary-items/itinerary-items.service.ts`

- ✅ 错误消息中使用 `place.nameEN || place.nameCN`

**文件**: `src/itinerary-optimization/itinerary-optimization.service.ts`

- ✅ 使用 `place.nameEN || place.nameCN`

---

## 📊 数据统计

### 字段填充率

| 字段 | 填充数量 | 填充率 | 说明 |
|------|---------|--------|------|
| `nameCN` | 28,425/28,425 | 100% | 已从 `name` 字段迁移 |
| `nameEN` | 0/28,425 | 0% | 待后续填充（可通过 Google Places API 或 Amap API） |

---

## 🎯 API 响应格式

### 查找附近地点

```bash
GET /places/nearby?lat=34.6937&lng=135.5023&radius=2000
```

**响应示例**:
```json
[
  {
    "id": 47,
    "name": "北京（通州）大运河文化旅游景区", // 显示名称（优先 nameEN）
    "nameCN": "北京（通州）大运河文化旅游景区",
    "nameEN": null,
    "category": "ATTRACTION",
    "distance": 1500,
    "isOpen": true,
    // ...
  }
]
```

**当 `nameEN` 有值时**:
```json
{
  "id": 123,
  "name": "Forbidden City", // 优先显示英文名称
  "nameCN": "故宫博物院",
  "nameEN": "Forbidden City",
  // ...
}
```

---

## 🔄 显示逻辑

### 名称显示优先级

在所有 API 响应中，`name` 字段的显示逻辑为：

```typescript
const displayName = place.nameEN || place.nameCN;
```

**规则**：
1. 如果 `nameEN` 存在，优先显示 `nameEN`
2. 如果 `nameEN` 为空，则显示 `nameCN`
3. 同时返回 `nameCN` 和 `nameEN` 字段，供前端选择使用

---

## 📝 后续工作

### 填充 nameEN 字段

可以通过以下方式填充 `nameEN` 字段：

1. **Google Places API**
   - 使用 `googlePlaceId` 获取英文名称
   - 已有 `googlePlaceId` 的记录可以直接更新

2. **Amap POI API**
   - 使用高德地图 API 获取英文名称
   - 需要调用 `enrichPlaceFromAmap()` 方法

3. **批量更新脚本**
   - 创建脚本遍历所有 Place 记录
   - 调用 API 获取英文名称并更新

### 示例脚本

```typescript
// scripts/fill-place-name-en.ts
async function fillPlaceNameEN() {
  const places = await prisma.place.findMany({
    where: { nameEN: null },
    select: { id: true, nameCN: true, googlePlaceId: true }
  });

  for (const place of places) {
    if (place.googlePlaceId) {
      // 使用 Google Places API 获取英文名称
      const details = await getGooglePlaceDetails(place.googlePlaceId);
      if (details?.name) {
        await prisma.place.update({
          where: { id: place.id },
          data: { nameEN: details.name }
        });
      }
    }
  }
}
```

---

## ✅ 实施检查清单

- [x] Schema 更新（`name` → `nameCN`）
- [x] 数据库迁移脚本创建和执行
- [x] DTO 接口更新
- [x] 服务层代码更新
- [x] SQL 查询更新
- [x] 错误消息更新
- [x] Prisma Client 重新生成
- [x] 数据验证通过
- [ ] `nameEN` 字段填充（待后续实施）

---

## 🎉 总结

成功完成了 Place 表名称字段的迁移：

1. ✅ **字段重命名**：`name` → `nameCN`
2. ✅ **数据迁移**：28,425 条记录安全迁移
3. ✅ **代码更新**：所有使用 `place.name` 的地方已更新
4. ✅ **显示逻辑**：优先显示 `nameEN`，如果没有则显示 `nameCN`
5. ✅ **向后兼容**：API 响应中的 `name` 字段保持兼容

现在系统已经支持：
- 🌍 中文名称（`nameCN`）：主要显示
- 🌍 英文名称（`nameEN`）：国际化支持
- 📱 智能显示：优先显示英文，自动回退到中文

为未来的国际化扩展打下了坚实基础！
