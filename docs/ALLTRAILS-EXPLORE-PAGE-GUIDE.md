# AllTrails Explore 页面爬取指南

## 📋 问题说明

AllTrails 的 `/explore` 页面使用 JavaScript 动态加载路线数据，普通的 HTTP 请求无法获取到完整的路线列表。

## 🔧 解决方案

### 方案 1: 使用 Playwright（推荐）

explore 页面需要等待 JavaScript 执行完成才能获取到路线链接。

```bash
# 1. 安装 Playwright（如果还没安装）
npx playwright install chromium

# 2. 使用 Playwright 模式爬取
npm run scrape:alltrails -- --playwright <explore_url>

# 示例：爬取西藏路线
npm run scrape:alltrails -- --playwright "https://www.alltrails.com/explore?b_br_lat=22.806851304627514&b_br_lng=100.12581000000057&b_tl_lat=35.21303840372971&b_tl_lng=81.25935000000078"
```

**注意**：Playwright 模式会自动：
- 等待页面加载完成
- 等待动态内容出现
- 滚动页面触发懒加载
- 提取所有路线链接

### 方案 2: 手动获取路线链接

如果 Playwright 不可用，可以手动从浏览器获取路线链接：

1. **在浏览器中打开 explore 页面**
   - 例如：`https://www.alltrails.com/explore?b_br_lat=22.806851304627514&b_br_lng=100.12581000000057&b_tl_lat=35.21303840372971&b_tl_lng=81.25935000000078`

2. **等待页面完全加载**（可能需要滚动到底部以加载所有路线）

3. **在浏览器控制台中运行以下代码**：
   ```javascript
   // 提取所有路线链接
   const links = Array.from(document.querySelectorAll('a[href*="/trail/"]'))
     .map(a => a.href)
     .filter((href, index, self) => self.indexOf(href) === index) // 去重
     .map(href => href.split('?')[0].split('#')[0]); // 清理 URL
   
   console.log(JSON.stringify(links, null, 2));
   ```

4. **复制输出的 JSON 数组**，保存到文件 `tibet_trail_urls.json`

5. **使用批量爬取脚本**（需要创建一个新脚本）：
   ```bash
   # 从 URL 列表文件批量爬取
   npm run scrape:alltrails:batch -- tibet_trail_urls.json
   ```

### 方案 3: 使用其他列表页 URL

如果 explore 页面不可用，可以尝试其他格式的列表页：

```bash
# 尝试国家/地区页面
npm run scrape:alltrails -- --list "https://www.alltrails.com/trails/china/tibet"

# 或搜索页面
npm run scrape:alltrails -- --list "https://www.alltrails.com/explore?q=tibet"
```

## 🐛 故障排除

### 问题 1: Playwright 安装失败

**错误信息**：
```
error while loading shared libraries: libglib-2.0.so.0
```

**解决方案**：
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y libglib2.0-0

# 然后重新安装 Playwright
npx playwright install chromium
```

### 问题 2: 403 Forbidden

**可能原因**：
- AllTrails 检测到爬虫
- IP 被限制

**解决方案**：
- 增加延时时间
- 使用 VPN 切换 IP
- 使用代理

### 问题 3: 找不到路线链接

**可能原因**：
- 页面结构已变化
- JavaScript 加载失败
- 需要登录

**解决方案**：
- 使用 `--debug` 模式查看页面内容
- 检查浏览器中页面是否正常加载
- 尝试手动访问 URL

## 📝 示例：完整工作流

```bash
# 1. 爬取 explore 页面（使用 Playwright）
npm run scrape:alltrails -- --playwright "https://www.alltrails.com/explore?b_br_lat=22.806851304627514&b_br_lng=100.12581000000057&b_tl_lat=35.21303840372971&b_tl_lng=81.25935000000078" --limit 50

# 2. 查看生成的文件
ls -lh alltrails_list_*.json

# 3. 导入到数据库
npm run import:alltrails -- alltrails_list_<timestamp>.json
```

## 💡 提示

1. **explore 页面通常包含大量路线**，建议使用 `--limit` 参数限制数量
2. **Playwright 模式较慢**，但能获取到完整数据
3. **如果遇到问题**，可以先在浏览器中手动访问 URL，确认页面是否正常

