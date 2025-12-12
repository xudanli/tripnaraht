# AllTrails 数据爬取指南

## 📋 概述

本脚本用于从 AllTrails 网站爬取步道数据，提取 **Difficulty** 和 **Fatigue** 相关信息。

⚠️ **重要**：
- 遵守 AllTrails 的 robots.txt
- 添加适当的延时，避免过度请求
- 仅用于个人/研究用途
- 实际使用时需要根据 AllTrails 的实际 HTML 结构调整选择器

## 🎯 提取的数据

### Difficulty Track（难度轨道）

- `trailDifficulty`: 官方难度评级（EASY, MODERATE, HARD, EXTREME）
- `riskFactors`: 风险因素（从描述中提取）
  - 技术动作：rope, exposure, scramble, technical
  - 地形不可逆：ice, loose_rock, unstable
  - 季节风险：winter_ice, snow
- `requiresEquipment`: 是否需要专业装备
- `requiresGuide`: 是否需要向导

### Fatigue Track（疲劳轨道）

- `totalDistance`: 总距离（公里）
- `elevationGainMeters`: 累计爬升（米）
- `maxElevation`: 最高海拔（米）

## 🚀 使用方法

### 1. 爬取单个路线

```bash
npm run scrape:alltrails -- --url https://www.alltrails.com/trail/us/arizona/tempe-town-lake-trail--2
```

**输出**：
- 控制台显示爬取结果
- 保存到 `alltrails_<timestamp>.json` 文件

### 2. 爬取列表页

```bash
npm run scrape:alltrails -- --list https://www.alltrails.com/parks --limit 5
```

**参数**：
- `--list <url>`: 列表页 URL
- `--limit <number>`: 可选，限制爬取数量（默认爬取所有）

**输出**：
- 保存到 `alltrails_list_<timestamp>.json` 文件

## 📊 输出格式

### 单个路线输出

```json
{
  "difficultyMetadata": {
    "level": "MODERATE",
    "source": "alltrails",
    "confidence": 0.9,
    "riskFactors": ["exposure", "ice"],
    "requiresEquipment": false,
    "requiresGuide": false
  },
  "fatigueMetadata": {
    "totalDistance": 5.2,
    "elevationGain": 200,
    "maxElevation": 1200
  },
  "metadata": {
    "source": "alltrails",
    "sourceUrl": "https://www.alltrails.com/trail/...",
    "name": "Tempe Town Lake Trail",
    "location": "Arizona, United States",
    "rating": "4.5",
    "description": "..."
  }
}
```

## 🔧 数据转换

脚本会自动将 AllTrails 数据转换为系统格式：

### Difficulty Metadata

```typescript
{
  level: 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME',
  source: 'alltrails',
  confidence: 0.9,  // AllTrails 数据置信度高
  riskFactors: string[],
  requiresEquipment: boolean,
  requiresGuide: boolean,
}
```

### Fatigue Metadata

```typescript
{
  totalDistance: number,      // 公里
  elevationGain: number,      // 米
  maxElevation: number,        // 米
}
```

## ⚠️ 注意事项

### 1. HTML 选择器需要调整

AllTrails 的 HTML 结构可能会变化，需要根据实际页面调整选择器：

```typescript
// 当前的选择器（可能需要调整）
$('[data-testid="difficulty-label"]')  // 难度
$('[data-testid="length-label"]')      // 长度
$('[data-testid="elevation-gain-label"]')  // 海拔增益
```

**如何调整**：
1. 打开 AllTrails 页面
2. 使用浏览器开发者工具检查元素
3. 找到对应的 CSS 选择器
4. 更新脚本中的选择器

### 2. 遵守 robots.txt

在爬取前，请检查 AllTrails 的 robots.txt：
```
https://www.alltrails.com/robots.txt
```

### 3. 请求频率

脚本已内置延时：
- 列表页请求：2 秒 + 随机 0-1 秒
- 详情页请求：2.5 秒 + 随机 0-1 秒

**建议**：
- 不要同时运行多个爬虫实例
- 避免在高峰时段爬取
- 如果被封禁，增加延时时间

### 4. 数据准确性

- AllTrails 的难度评级是**官方评级**，置信度高（0.9）
- 风险因素从描述中提取，可能不完整
- 距离和爬升数据如果页面没有，需要从 GPX 文件获取

## 🔄 与系统集成

### 1. 导入 Difficulty Metadata

```typescript
import { TrailDifficultyAssessor } from './utils/trail-difficulty-assessor.util';

const alltrailsData = JSON.parse(fs.readFileSync('alltrails_data.json', 'utf-8'));

for (const trail of alltrailsData) {
  if (trail.difficultyMetadata) {
    // 使用 AllTrails 的 difficulty 数据
    const difficulty = TrailDifficultyAssessor.assess({
      trailDifficulty: trail.difficultyMetadata.level,
      riskFactors: trail.difficultyMetadata.riskFactors,
      requiresEquipment: trail.difficultyMetadata.requiresEquipment,
      requiresGuide: trail.difficultyMetadata.requiresGuide,
      source: 'alltrails',
    });
  }
}
```

### 2. 导入 Fatigue Metadata

```typescript
import { PhysicalMetadataGenerator } from './utils/physical-metadata-generator.util';

for (const trail of alltrailsData) {
  if (trail.fatigueMetadata) {
    const fatigue = PhysicalMetadataGenerator.generateByCategory(
      PlaceCategory.ATTRACTION,
      {
        // GPX 分析结果（如果有）
        gpxAnalysis: trail.fatigueMetadata,
        // 其他 metadata
        ...trail.metadata,
      }
    );
  }
}
```

## 📝 示例：完整工作流

```typescript
// 1. 爬取 AllTrails 数据
// npm run scrape:alltrails -- --url <url>

// 2. 读取爬取的数据
const alltrailsData = JSON.parse(
  fs.readFileSync('alltrails_data.json', 'utf-8')
);

// 3. 提取 Difficulty
const difficulty = TrailDifficultyAssessor.assess({
  trailDifficulty: alltrailsData.difficultyMetadata.level,
  riskFactors: alltrailsData.difficultyMetadata.riskFactors,
  source: 'alltrails',
});

// 4. 提取 Fatigue（如果有 GPX 数据，优先使用 GPX）
let fatigue;
if (gpxData) {
  const analysis = GPXFatigueCalculator.analyzeGPX(gpxPoints);
  fatigue = GPXFatigueCalculator.generateFatigueMetadata(analysis);
} else if (alltrailsData.fatigueMetadata) {
  fatigue = PhysicalMetadataGenerator.generateByCategory(
    PlaceCategory.ATTRACTION,
    { gpxAnalysis: alltrailsData.fatigueMetadata }
  );
}

// 5. 弱耦合联动
const finalFatigue = applyDifficultyModifier(fatigue, difficulty);

// 6. 保存到数据库
await prisma.place.create({
  data: {
    nameCN: alltrailsData.metadata.name,
    category: PlaceCategory.ATTRACTION,
    metadata: alltrailsData.metadata,
    physicalMetadata: finalFatigue,
    // difficultyMetadata 可以存储在 metadata 中，或单独的字段
  },
});
```

## 🐛 故障排除

### 问题 1: 无法获取页面

**可能原因**：
- AllTrails 检测到爬虫
- 网络问题
- URL 错误

**解决方案**：
- 增加延时时间
- 检查 User-Agent 是否正确
- 使用代理（如果需要）

### 问题 2: 选择器无法匹配

**可能原因**：
- AllTrails 更新了 HTML 结构
- 选择器错误

**解决方案**：
- 使用浏览器开发者工具检查实际 HTML
- 更新选择器
- 使用更通用的选择器（如 `h1`, `span` 等）

### 问题 3: 数据不完整

**可能原因**：
- 页面结构变化
- 某些字段在页面上不存在

**解决方案**：
- 检查页面是否包含所需数据
- 使用多个选择器尝试匹配
- 从其他数据源补充（如 GPX 文件）

## 📚 相关文档

- [`docs/DIFFICULTY-REQUIRED-FIELDS.md`](./DIFFICULTY-REQUIRED-FIELDS.md) - Difficulty 所需字段
- [`docs/PHYSICAL-METADATA-REQUIRED-FIELDS.md`](./PHYSICAL-METADATA-REQUIRED-FIELDS.md) - Fatigue 所需字段
- [`docs/GPX-FATIGUE-CALCULATION.md`](./GPX-FATIGUE-CALCULATION.md) - GPX 数据计算
- [`scripts/scrape-alltrails.ts`](../scripts/scrape-alltrails.ts) - 爬虫脚本源码
