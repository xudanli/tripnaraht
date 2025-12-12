# PlaceCategory 获取指南

## 📋 概述

`PlaceCategory` 是 `Place` 表的必需字段，用于标识地点的类型。本文档说明如何获取和确定 `category` 值。

## 🎯 PlaceCategory 枚举定义

```typescript
enum PlaceCategory {
  ATTRACTION    // 景点（博物馆、公园、自然景观等）
  RESTAURANT    // 餐厅
  SHOPPING      // 购物（商场、市场等）
  HOTEL         // 酒店
  TRANSIT_HUB   // 交通枢纽（机场、火车站等）
}
```

## 📊 不同数据源的获取方式

### 1. 自然 POI 数据（冰岛自然景点）

**来源**: `NaturePoiService.saveNaturePoiAsPlace()`

**方式**: 固定为 `ATTRACTION`

```typescript
// src/places/services/nature-poi.service.ts
const place = await this.prisma.place.create({
  data: {
    category: 'ATTRACTION',  // 固定值
    // ...
  },
});
```

**原因**: 自然 POI 都是景点类型（火山、冰川、瀑布等）

---

### 2. 马蜂窝景点数据

**来源**: `scripts/scrape-mafengwo-attractions.ts`

**方式**: 固定为 `ATTRACTION`

```typescript
// scripts/scrape-mafengwo-attractions.ts
const place = await prisma.place.create({
  data: {
    category: 'ATTRACTION',  // 固定值
    // ...
  },
});
```

**原因**: 马蜂窝爬取的都是景点数据

---

### 3. 酒店推荐数据

**来源**: `HotelRecommendationService`

**方式**: 固定为 `HOTEL`

```typescript
// src/places/services/hotel-recommendation.service.ts
const place = await this.prisma.place.create({
  data: {
    category: PlaceCategory.HOTEL,  // 固定值
    // ...
  },
});
```

**原因**: 酒店推荐服务专门处理酒店数据

---

### 4. 用户手动创建

**来源**: `PlacesService.createPlace()`

**方式**: 通过 `CreatePlaceDto` 传入（必需字段）

```typescript
// src/places/dto/create-place.dto.ts
export class CreatePlaceDto {
  @IsEnum(PlaceCategory)
  category!: PlaceCategory;  // 必需字段，用户必须指定
  // ...
}
```

**使用示例**:
```typescript
// API 调用
POST /places
{
  "nameCN": "故宫博物院",
  "category": "ATTRACTION",  // 用户指定
  "lat": 39.9163,
  "lng": 116.3972,
  // ...
}
```

---

### 5. Google Places API

**来源**: Google Places API 返回的 `types` 字段

**方式**: 需要从 Google Places 的 `types` 映射到 `PlaceCategory`

**Google Places Types**:
- `tourist_attraction`, `museum`, `park`, `zoo` → `ATTRACTION`
- `restaurant`, `cafe`, `food` → `RESTAURANT`
- `shopping_mall`, `store`, `market` → `SHOPPING`
- `lodging`, `hotel` → `HOTEL`
- `airport`, `train_station`, `subway_station` → `TRANSIT_HUB`

**建议实现**: 创建一个映射工具函数

---

## 🔧 自动分类工具（建议实现）

目前系统**没有自动分类功能**，都是手动指定或硬编码。建议创建一个工具函数用于从外部数据推断 category：

### 实现示例

```typescript
// src/places/utils/category-inferrer.util.ts
import { PlaceCategory } from '@prisma/client';

export class CategoryInferrer {
  /**
   * 从 Google Places types 推断 category
   */
  static fromGooglePlacesTypes(types: string[]): PlaceCategory {
    // 优先级：HOTEL > TRANSIT_HUB > RESTAURANT > SHOPPING > ATTRACTION
    
    if (types.some(t => ['lodging', 'hotel'].includes(t))) {
      return PlaceCategory.HOTEL;
    }
    
    if (types.some(t => ['airport', 'train_station', 'subway_station', 'bus_station'].includes(t))) {
      return PlaceCategory.TRANSIT_HUB;
    }
    
    if (types.some(t => ['restaurant', 'cafe', 'food', 'meal_takeaway'].includes(t))) {
      return PlaceCategory.RESTAURANT;
    }
    
    if (types.some(t => ['shopping_mall', 'store', 'supermarket', 'market'].includes(t))) {
      return PlaceCategory.SHOPPING;
    }
    
    // 默认：景点
    return PlaceCategory.ATTRACTION;
  }

  /**
   * 从名称关键词推断 category
   */
  static fromName(name: string): PlaceCategory {
    const lower = name.toLowerCase();
    
    // 酒店关键词
    if (/\b(酒店|宾馆|旅馆|hotel|inn|resort|hostel)\b/i.test(lower)) {
      return PlaceCategory.HOTEL;
    }
    
    // 餐厅关键词
    if (/\b(餐厅|饭店|餐馆|restaurant|cafe|bistro|diner)\b/i.test(lower)) {
      return PlaceCategory.RESTAURANT;
    }
    
    // 购物关键词
    if (/\b(商场|市场|购物|mall|market|store|shop)\b/i.test(lower)) {
      return PlaceCategory.SHOPPING;
    }
    
    // 交通枢纽关键词
    if (/\b(机场|火车站|汽车站|airport|station|terminal)\b/i.test(lower)) {
      return PlaceCategory.TRANSIT_HUB;
    }
    
    // 默认：景点
    return PlaceCategory.ATTRACTION;
  }

  /**
   * 从描述文本推断 category
   */
  static fromDescription(description: string): PlaceCategory {
    const lower = description.toLowerCase();
    
    // 酒店相关
    if (/\b(住宿|客房|check-in|checkout|room|suite)\b/i.test(lower)) {
      return PlaceCategory.HOTEL;
    }
    
    // 餐厅相关
    if (/\b(菜单|菜品|cuisine|menu|dining|food)\b/i.test(lower)) {
      return PlaceCategory.RESTAURANT;
    }
    
    // 购物相关
    if (/\b(购物|商品|shopping|retail|purchase)\b/i.test(lower)) {
      return PlaceCategory.SHOPPING;
    }
    
    // 交通相关
    if (/\b(航班|列车|departure|arrival|gate|platform)\b/i.test(lower)) {
      return PlaceCategory.TRANSIT_HUB;
    }
    
    // 默认：景点
    return PlaceCategory.ATTRACTION;
  }

  /**
   * 综合推断（优先级：Google Types > 名称 > 描述）
   */
  static infer(
    googleTypes?: string[],
    name?: string,
    description?: string
  ): PlaceCategory {
    // 优先级1：Google Places types（最可靠）
    if (googleTypes && googleTypes.length > 0) {
      return this.fromGooglePlacesTypes(googleTypes);
    }
    
    // 优先级2：名称关键词
    if (name) {
      return this.fromName(name);
    }
    
    // 优先级3：描述文本
    if (description) {
      return this.fromDescription(description);
    }
    
    // 默认：景点
    return PlaceCategory.ATTRACTION;
  }
}
```

### 使用示例

```typescript
// 从 Google Places API 推断
const googlePlace = await googlePlacesService.getPlace(placeId);
const category = CategoryInferrer.fromGooglePlacesTypes(googlePlace.types);

// 从名称推断
const category = CategoryInferrer.fromName("北京首都国际机场");

// 综合推断
const category = CategoryInferrer.infer(
  googlePlace?.types,
  place.nameCN,
  place.description
);
```

---

## 📝 实际使用场景

### 场景 1: 从马蜂窝导入景点

```typescript
// scripts/scrape-mafengwo-attractions.ts
async function saveAttraction(attraction: MafengwoAttraction) {
  const place = await prisma.place.create({
    data: {
      category: 'ATTRACTION',  // 固定值，因为马蜂窝都是景点
      nameCN: attraction.name,
      // ...
    },
  });
}
```

### 场景 2: 从 Google Places 导入

```typescript
// 建议实现
async function importFromGooglePlaces(googlePlaceId: string) {
  const googlePlace = await googlePlacesService.getPlace(googlePlaceId);
  
  // 使用自动推断
  const category = CategoryInferrer.fromGooglePlacesTypes(googlePlace.types);
  
  const place = await prisma.place.create({
    data: {
      category: category,  // 自动推断
      nameCN: googlePlace.name,
      // ...
    },
  });
}
```

### 场景 3: 用户手动创建

```typescript
// API 端点
@Post()
async createPlace(@Body() dto: CreatePlaceDto) {
  // dto.category 已经由用户指定
  return this.placesService.createPlace(dto);
}
```

### 场景 4: 批量导入混合类型数据

```typescript
// 从 CSV 导入
async function importFromCSV(row: CSVRow) {
  // 尝试从多个字段推断
  const category = CategoryInferrer.infer(
    row.googleTypes?.split(','),  // Google types
    row.name,                      // 名称
    row.description                // 描述
  );
  
  const place = await prisma.place.create({
    data: {
      category: category,
      // ...
    },
  });
}
```

---

## ⚠️ 注意事项

1. **category 是必需字段**: 创建 `Place` 时必须提供 `category`
2. **目前没有自动分类**: 系统目前都是手动指定或硬编码
3. **建议实现自动推断**: 对于外部数据源（如 Google Places），建议实现自动推断功能
4. **默认值**: 如果无法确定，使用 `ATTRACTION` 作为默认值（因为景点是最常见的类型）

---

## 🚀 未来改进建议

### 1. 实现自动分类工具

创建 `CategoryInferrer` 工具类（如上文示例），支持：
- 从 Google Places types 推断
- 从名称关键词推断
- 从描述文本推断
- 综合推断（多数据源）

### 2. 添加分类置信度

```typescript
interface CategoryInference {
  category: PlaceCategory;
  confidence: number;  // 0-1，置信度
  source: 'google_types' | 'name' | 'description' | 'manual';
}
```

### 3. 支持用户修正

允许用户手动修正自动推断的 category，并记录修正历史用于改进推断算法。

### 4. 机器学习增强

收集用户修正数据，训练分类模型，提高自动推断准确率。

---

## 📚 相关文件

- `prisma/schema.prisma` - PlaceCategory 枚举定义
- `src/places/dto/create-place.dto.ts` - CreatePlaceDto（category 必需字段）
- `src/places/services/nature-poi.service.ts` - 自然 POI 导入（固定 ATTRACTION）
- `scripts/scrape-mafengwo-attractions.ts` - 马蜂窝导入（固定 ATTRACTION）
- `src/places/services/hotel-recommendation.service.ts` - 酒店推荐（固定 HOTEL）
