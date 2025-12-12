# 填充 Place.nameEN 字段指南

## 📋 脚本说明

**文件**: `scripts/fill-place-name-en.ts`

该脚本用于填充 Place 表的 `nameEN`（英文名称）字段。

## 🎯 填充策略

### 策略1: Google Places API（优先）

如果地点有 `googlePlaceId`，优先使用 Google Places API 获取官方英文名称：

```typescript
// 调用 Google Places API Details
GET https://maps.googleapis.com/maps/api/place/details/json
  ?place_id={googlePlaceId}
  &fields=name
  &key={GOOGLE_PLACES_API_KEY}
  &language=en
```

**优点**：
- 获取官方英文名称，准确性高
- 适合已有 Google Place ID 的地点

### 策略2: Google Translate API（备选）

如果 Google Places API 失败或没有 `googlePlaceId`，使用 Google Translate API 翻译中文名称：

```typescript
// 调用 Google Cloud Translation API
POST https://translation.googleapis.com/language/translate/v2?key={API_KEY}
{
  "q": "故宫博物院",
  "source": "zh",
  "target": "en",
  "format": "text"
}
```

**优点**：
- 适用于所有地点
- 可以批量翻译

**缺点**：
- 翻译可能不够准确
- 需要启用 Google Cloud Translation API

## 🚀 使用方法

### 1. 配置环境变量

在 `.env` 文件中配置 API Key：

```bash
# Google Places API Key（用于获取地点详情）
GOOGLE_PLACES_API_KEY=your_google_places_api_key

# Google Translate API Key（可选，用于翻译）
GOOGLE_TRANSLATE_API_KEY=your_google_translate_api_key
# 如果没有单独配置，会使用 GOOGLE_PLACES_API_KEY
```

### 2. 运行脚本

```bash
# 方式1: 使用 npm 脚本
npm run fill:name-en

# 方式2: 直接运行
npx ts-node --project tsconfig.backend.json scripts/fill-place-name-en.ts
```

### 3. 脚本行为

- **分批处理**：每批 10 个地点，避免 API 限流
- **延迟控制**：每个 API 调用间隔 200ms，批次间延迟 1 秒
- **类别过滤**：只翻译 `ATTRACTION`、`RESTAURANT`、`SHOPPING`、`HOTEL` 类别
- **错误处理**：API 调用失败时记录错误，继续处理下一个

## 📊 输出示例

```
🚀 开始填充 Place.nameEN 字段...

📊 找到 28425 个需要填充 nameEN 的地点

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

处理批次 1/2843 (10 个地点)
  ✅ [47] 北京（通州）大运河文化旅游景区 → Beijing (Tongzhou) Grand Canal Cultural Tourism Scenic Area (Google Places)
  ✅ [48] 文化和旅游部恭王府博物馆 → Prince Gong's Mansion Museum (Google Translate)
  ⏭️  [49] 八达岭长城景区 - 跳过（类别: TRANSIT_HUB）
  ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 填充统计:
   总地点数: 28425
   成功更新: 15234
   - Google Places API: 3421
   - Google Translate API: 11813
   跳过: 8567
   失败: 4624
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 总体统计: nameEN填充率: 15234/28425 (53.6%)
```

## ⚙️ 配置说明

### Google Places API

1. **获取 API Key**：
   - 访问 [Google Cloud Console](https://console.cloud.google.com/)
   - 启用 "Places API"
   - 创建 API Key

2. **API 限制**：
   - 免费层：每月 $200 额度
   - Details API：每次调用约 $0.017
   - 约可调用 11,000 次/月

### Google Translate API

1. **获取 API Key**：
   - 访问 [Google Cloud Console](https://console.cloud.google.com/)
   - 启用 "Cloud Translation API"
   - 创建 API Key

2. **API 限制**：
   - 免费层：每月 500,000 字符
   - 标准层：$20/百万字符

## 🔧 优化建议

### 1. 优先处理有 googlePlaceId 的地点

```typescript
// 先处理有 googlePlaceId 的地点
const placesWithGoogleId = await prisma.place.findMany({
  where: {
    nameEN: null,
    googlePlaceId: { not: null },
  },
});
```

### 2. 使用缓存避免重复翻译

对于相同的中文名称，可以缓存翻译结果：

```typescript
const translationCache = new Map<string, string>();

async function translateWithCache(nameCN: string): Promise<string | null> {
  if (translationCache.has(nameCN)) {
    return translationCache.get(nameCN)!;
  }
  
  const translated = await translateNameToEnglish(nameCN);
  if (translated) {
    translationCache.set(nameCN, translated);
  }
  return translated;
}
```

### 3. 批量翻译

Google Translate API 支持批量翻译，可以一次翻译多个文本：

```typescript
const data = {
  q: ['文本1', '文本2', '文本3'],
  source: 'zh',
  target: 'en',
};
```

## 📝 后续工作

1. **验证翻译质量**：
   - 检查翻译结果是否准确
   - 对于明显错误的翻译，可以手动修正

2. **补充缺失数据**：
   - 对于翻译失败的地点，可以：
     - 手动添加英文名称
     - 使用其他翻译服务（如百度翻译、有道翻译）
     - 从其他数据源获取（如 Wikipedia、TripAdvisor）

3. **定期更新**：
   - 新添加的地点需要定期运行脚本填充 nameEN
   - 可以集成到数据导入流程中

## ✅ 检查清单

- [ ] 配置 Google Places API Key
- [ ] 配置 Google Translate API Key（可选）
- [ ] 运行脚本测试
- [ ] 检查翻译质量
- [ ] 验证 API 响应中的 nameEN 字段
- [ ] 更新相关文档

---

## 🎉 总结

通过该脚本，可以：

1. ✅ **自动填充**：批量填充所有地点的英文名称
2. ✅ **多策略**：优先使用官方数据，备选翻译服务
3. ✅ **智能过滤**：只翻译需要国际化的类别
4. ✅ **错误处理**：API 失败时继续处理，不中断脚本

现在系统已经支持中英文名称的完整国际化！
