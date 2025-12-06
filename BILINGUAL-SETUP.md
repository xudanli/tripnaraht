# 🌍 双语抓取功能设置指南

## 功能说明

本系统支持双语抓取功能，可以同时获取地点的中文和英文名称。这对于国际化应用非常重要，可以让用户根据语言偏好看到对应的名称。

## 实现原理

采用"双语抓取 + ID 合并"策略：
1. 并行运行两个爬虫任务（一个中文，一个英文）
2. 通过 `googlePlaceId` 将两条数据合并
3. 得到包含中英文名称的完整数据

## 设置步骤

### 1. 更新数据库 Schema

已添加 `nameEN` 字段到 `Place` 模型：

```prisma
model Place {
  name      String   // 默认名称 (通常存中文)
  nameEN    String?  // 英文名称 (可选)
  // ... 其他字段
}
```

**应用更改：**

```bash
# 生成 Prisma Client（包含新的 nameEN 字段）
npm run prisma:generate

# 如果数据库已存在，需要运行迁移
npm run prisma:migrate
```

### 2. 抓取脚本已更新

`scripts/scrape-places.ts` 已实现双语抓取功能：

- ✅ 并行运行中英文两个抓取任务
- ✅ 自动合并数据
- ✅ 生成包含 `name` 和 `nameEN` 的 JSON 文件

**运行抓取：**

```bash
npm run scrape
```

### 3. 入库脚本已更新

`scripts/seed-places.ts` 已支持 `nameEN` 字段：

- ✅ 读取 `nameEN` 字段
- ✅ 写入数据库的 `nameEN` 列

**导入数据：**

```bash
npm run seed
```

## 使用示例

### 抓取的数据结构

```json
{
  "name": "黄金瀑布",
  "nameEN": "Gullfoss Waterfall",
  "googlePlaceId": "ChIJ...",
  "location": {
    "lat": 64.3264,
    "lng": -20.1214
  },
  // ... 其他字段
}
```

### API 返回示例

```json
{
  "id": 1,
  "name": "黄金瀑布",
  "nameEN": "Gullfoss Waterfall",
  "category": "ATTRACTION",
  // ... 其他字段
}
```

### 前端使用

根据用户语言设置动态显示：

```typescript
// 根据系统语言选择显示的名称
const displayName = userLanguage === 'zh-CN' 
  ? place.name      // "黄金瀑布"
  : place.nameEN;   // "Gullfoss Waterfall"
```

## 配置说明

### 修改抓取的国家/地区

在 `scripts/scrape-places.ts` 中修改：

```typescript
// 1. 修改搜索关键词
const searchTerms = [
    'Your search terms here',
    // ...
];

// 2. 修改地理位置
locationQuery: 'Your Country',  // 例如：'Japan', 'Iceland'

// 3. 修改时区
timezone: 'Asia/Tokyo',  // 例如：'Atlantic/Reykjavik' (冰岛)
```

### 修改默认城市

在 `scripts/seed-places.ts` 中修改：

```typescript
let defaultCity = await prisma.city.findFirst({
    where: { 
        name: 'Your City',        // 例如：'Osaka', 'Reykjavik'
        countryCode: 'XX'         // ISO 国家代码：'JP', 'IS'
    } 
});
```

## 注意事项

1. **成本控制**：双语抓取会运行两次爬虫，成本是单次的两倍。测试时建议设置较小的 `maxCrawledPlacesPerSearch`。

2. **数据匹配**：合并依赖 `googlePlaceId`。如果某个地点在两次抓取中 ID 不一致，将无法合并。

3. **回退机制**：如果英文抓取失败或找不到对应数据，`nameEN` 会回退到中文名称，确保数据可用。

4. **时区设置**：记得根据抓取的国家修改时区配置，确保营业时间判断正确。

## 故障排除

### 问题：Prisma 报错 "nameEN 不存在"

**解决：** 运行 `npm run prisma:generate` 重新生成 Prisma Client。

### 问题：英文数据为空

**检查：**
- Actor ID 是否正确
- API Token 是否有效
- 搜索关键词是否适合英文搜索

### 问题：数据无法合并

**检查：**
- 两次抓取是否都成功
- `googlePlaceId` 是否一致
- 查看控制台日志中的合并统计

## 下一步

- ✅ 数据库 Schema 已更新
- ✅ 抓取脚本已实现双语功能
- ✅ 入库脚本已支持 nameEN
- ⏭️ 运行 `npm run prisma:generate` 生成新的 Prisma Client
- ⏭️ 运行 `npm run scrape` 抓取双语数据
- ⏭️ 运行 `npm run seed` 导入数据

