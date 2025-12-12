# AllTrails 批量爬取指南

## 📋 概述

批量爬取脚本允许你从 URL 列表文件中批量爬取 AllTrails 路线数据。

## 🚀 使用方法

### 1. 准备 URL 列表文件

创建一个 JSON 文件，包含要爬取的路线 URL：

**格式 1：简单数组**
```json
[
  "https://www.alltrails.com/trail/iceland/southern/trail-1",
  "https://www.alltrails.com/trail/iceland/southern/trail-2",
  "https://www.alltrails.com/trail/iceland/eastern/trail-3"
]
```

**格式 2：对象格式**
```json
{
  "urls": [
    "https://www.alltrails.com/trail/iceland/southern/trail-1",
    "https://www.alltrails.com/trail/iceland/southern/trail-2"
  ]
}
```

### 2. 运行批量爬取

```bash
# 爬取所有 URL
npm run scrape:alltrails:batch -- <urls_file.json>

# 限制爬取数量
npm run scrape:alltrails:batch -- <urls_file.json> --limit 20

# 启用调试模式
npm run scrape:alltrails:batch -- <urls_file.json> --limit 10 --debug
```

### 3. 查看结果

爬取完成后，数据会保存到：
- `alltrails_batch_<timestamp>.json` - 最终结果
- `alltrails_batch_temp_<timestamp>.json` - 临时备份（每 5 条保存一次）

## 📝 完整示例

### 步骤 1: 从浏览器获取 URL 列表

在浏览器中打开 AllTrails explore 页面，等待加载完成，然后在控制台运行：

```javascript
// 提取所有路线链接
const links = Array.from(document.querySelectorAll('a[href*="/trail/"]'))
  .map(a => a.href)
  .filter((href, index, self) => self.indexOf(href) === index) // 去重
  .map(href => href.split('?')[0].split('#')[0]); // 清理 URL

// 复制到剪贴板
navigator.clipboard.writeText(JSON.stringify(links, null, 2));
console.log(`已提取 ${links.length} 个 URL，已复制到剪贴板`);
```

### 步骤 2: 保存 URL 列表

将复制的 JSON 保存到文件，例如 `tibet_trail_urls.json`

### 步骤 3: 批量爬取

```bash
# 爬取前 50 条
npm run scrape:alltrails:batch -- tibet_trail_urls.json --limit 50

# 爬取所有（不限制）
npm run scrape:alltrails:batch -- tibet_trail_urls.json
```

### 步骤 4: 导入到数据库

```bash
npm run import:alltrails -- alltrails_batch_<timestamp>.json
```

## ⚙️ 功能特性

1. **自动延时**：每条路线 3-5 秒随机延时，避免被封
2. **自动重试**：失败时自动重试 3 次
3. **自动降级**：HTTP 失败时自动尝试 Playwright（如果可用）
4. **临时保存**：每抓取 5 条自动保存，防止数据丢失
5. **进度显示**：实时显示爬取进度和状态

## ⚠️ 注意事项

1. **请求频率**：脚本已内置延时，但建议不要同时运行多个实例
2. **403 错误**：如果遇到 403，可能需要：
   - 增加延时时间
   - 使用 VPN 切换 IP
   - 使用代理
3. **Playwright 依赖**：如果 Playwright 不可用，脚本仍会尝试 HTTP 请求

## 🐛 故障排除

### 问题 1: 403 Forbidden

**解决方案**：
- 增加延时时间（修改脚本中的 delay 参数）
- 使用 VPN 切换 IP
- 检查是否需要登录

### 问题 2: 找不到路线数据

**可能原因**：
- URL 格式不正确
- 页面结构已变化
- 需要登录

**解决方案**：
- 检查 URL 是否正确
- 使用 `--debug` 模式查看详细信息
- 手动访问 URL 确认页面是否正常

### 问题 3: Playwright 错误

如果看到 `libglib-2.0.so.0` 错误：

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y libglib2.0-0

# 然后重新安装 Playwright
npx playwright install chromium
```

## 📊 输出格式

批量爬取的结果格式与单个爬取相同：

```json
[
  {
    "difficultyMetadata": {
      "level": "MODERATE",
      "source": "alltrails",
      "confidence": 0.9,
      "riskFactors": [],
      "requiresEquipment": false,
      "requiresGuide": false
    },
    "fatigueMetadata": {
      "totalDistance": 3.4,
      "elevationGain": 133
    },
    "metadata": {
      "source": "alltrails",
      "sourceUrl": "https://www.alltrails.com/trail/...",
      "name": "Trail Name",
      "rating": "4.7",
      "description": "...",
      "length": "3.4 km",
      "elevationGain": "133 m",
      "estimatedTime": "1–1.5 hr"
    }
  },
  ...
]
```

## 💡 提示

1. **分批爬取**：如果 URL 列表很长，建议分批爬取（使用 `--limit`）
2. **保存中间结果**：脚本会自动保存临时文件，可以随时中断和恢复
3. **检查数据质量**：爬取完成后，检查 JSON 文件确保数据完整

