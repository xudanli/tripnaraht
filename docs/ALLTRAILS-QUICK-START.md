# AllTrails 数据爬取快速开始

## 🚀 快速使用

### 1. 爬取单个路线

```bash
# 使用 HTTP 请求（失败时自动降级到 Playwright）
npm run scrape:alltrails -- --url https://www.alltrails.com/trail/us/arizona/tempe-town-lake-trail--2

# 强制使用 Playwright（需要先安装浏览器）
npx playwright install chromium
npm run scrape:alltrails -- --playwright https://www.alltrails.com/trail/us/arizona/tempe-town-lake-trail--2
```

### 2. 爬取列表页

```bash
# 爬取列表页的所有路线
npm run scrape:alltrails -- --list https://www.alltrails.com/parks

# 限制爬取数量
npm run scrape:alltrails -- --list https://www.alltrails.com/parks --limit 10
```

### 3. 导入到数据库

```bash
# 导入单个路线数据
npm run import:alltrails -- alltrails_1765537604163.json

# 导入列表数据
npm run import:alltrails -- alltrails_list_1765537604163.json
```

## 📋 完整工作流示例

```bash
# 1. 爬取数据
npm run scrape:alltrails -- --url https://www.alltrails.com/trail/us/arizona/tempe-town-lake-trail--2

# 2. 查看生成的文件（例如：alltrails_1765537604163.json）
ls -la alltrails_*.json

# 3. 导入到数据库
npm run import:alltrails -- alltrails_1765537604163.json
```

## 🔧 功能特性

### 自动降级机制

- 默认使用 HTTP 请求（快速）
- 如果遇到 403 或网络错误，自动降级到 Playwright（更可靠）
- 需要先安装 Playwright: `npx playwright install chromium`

### 提取的数据

**Difficulty Track（难度轨道）:**
- `trailDifficulty`: 官方难度评级（EASY, MODERATE, HARD, EXTREME）
- `riskFactors`: 风险因素（从描述中提取）
- `requiresEquipment`: 是否需要专业装备
- `requiresGuide`: 是否需要向导

**Fatigue Track（疲劳轨道）:**
- `totalDistance`: 总距离（公里）
- `elevationGain`: 累计爬升（米）
- `maxElevation`: 最高海拔（米）
- `estimatedTime`: 预估时间

**基础信息:**
- `name`: 路线名称
- `location`: 位置
- `rating`: 评分
- `description`: 描述
- `coordinates`: 坐标（如果有）

## ⚠️ 注意事项

1. **遵守 robots.txt**: 请遵守 AllTrails 的使用条款
2. **请求频率**: 脚本已内置延时，避免过度请求
3. **数据准确性**: AllTrails 的难度评级置信度高（0.9），但风险因素从描述中提取，可能不完整
4. **HTML 结构变化**: 如果爬取失败，可能是 AllTrails 更新了 HTML 结构，需要更新选择器

## 🐛 故障排除

### 问题 1: 403 Forbidden

**解决方案:**
- 脚本会自动尝试使用 Playwright
- 如果 Playwright 未安装，运行: `npx playwright install chromium`
- 增加延时时间（修改脚本中的 delay 参数）

### 问题 2: 数据不完整

**可能原因:**
- AllTrails 更新了 HTML 结构
- 某些字段在页面上不存在

**解决方案:**
- 使用浏览器开发者工具检查实际 HTML
- 更新脚本中的选择器

### 问题 3: Playwright 未安装

**解决方案:**
```bash
npx playwright install chromium
```

## 📚 相关文档

- [`docs/ALLTRAILS-SCRAPER-GUIDE.md`](./ALLTRAILS-SCRAPER-GUIDE.md) - 详细使用指南
- [`scripts/scrape-alltrails.ts`](../scripts/scrape-alltrails.ts) - 爬虫脚本源码
- [`scripts/import-alltrails-to-db.ts`](../scripts/import-alltrails-to-db.ts) - 数据库导入脚本

