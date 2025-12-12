# 从浏览器提取 AllTrails 路线 URL

## 📋 方法 1: 改进版（处理剪贴板错误）

在浏览器控制台中运行以下代码：

```javascript
// 提取所有路线链接
const links = Array.from(document.querySelectorAll('a[href*="/trail/"]'))
  .map(a => a.href)
  .filter((href, index, self) => self.indexOf(href) === index) // 去重
  .map(href => href.split('?')[0].split('#')[0]); // 清理 URL

// 尝试复制到剪贴板，如果失败则直接输出
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    console.log('✅ 已复制到剪贴板');
    return true;
  } catch (error) {
    console.warn('⚠️  剪贴板复制失败（页面未获得焦点），使用备用方案...');
    return false;
  }
}

// 格式化输出
const jsonText = JSON.stringify(links, null, 2);

// 尝试复制
copyToClipboard(jsonText).then(success => {
  if (!success) {
    // 备用方案：直接输出到控制台，用户可以手动复制
    console.log('\n📋 URL 列表（请手动复制）：');
    console.log(jsonText);
    console.log('\n💡 提示：选中上面的 JSON 文本，右键复制');
  }
  
  console.log(`\n✅ 已提取 ${links.length} 个 URL`);
  console.log(`📝 前 5 个 URL:`);
  links.slice(0, 5).forEach((url, i) => {
    console.log(`   ${i + 1}. ${url}`);
  });
});
```

## 📋 方法 2: 简单版（直接输出）

如果剪贴板有问题，使用这个版本：

```javascript
// 提取所有路线链接
const links = Array.from(document.querySelectorAll('a[href*="/trail/"]'))
  .map(a => a.href)
  .filter((href, index, self) => self.indexOf(href) === index)
  .map(href => href.split('?')[0].split('#')[0]);

// 输出 JSON
const jsonText = JSON.stringify(links, null, 2);
console.log(jsonText);

// 输出统计信息
console.log(`\n✅ 已提取 ${links.length} 个 URL`);
console.log('📝 请手动复制上面的 JSON 文本');
```

## 📋 方法 3: 自动下载文件（推荐）

这个版本会自动下载 JSON 文件：

```javascript
// 提取所有路线链接
const links = Array.from(document.querySelectorAll('a[href*="/trail/"]'))
  .map(a => a.href)
  .filter((href, index, self) => self.indexOf(href) === index)
  .map(href => href.split('?')[0].split('#')[0]);

// 创建 JSON 文本
const jsonText = JSON.stringify(links, null, 2);

// 创建下载链接
const blob = new Blob([jsonText], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `alltrails_urls_${new Date().getTime()}.json`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);

console.log(`✅ 已提取 ${links.length} 个 URL，文件已下载`);
```

## 🚀 使用步骤

1. **打开 AllTrails explore 页面**
   - 例如：`https://www.alltrails.com/explore?b_br_lat=22.806851304627514&b_br_lng=100.12581000000057&b_tl_lat=35.21303840372971&b_tl_lng=81.25935000000078`

2. **等待页面完全加载**
   - 可能需要滚动到底部以加载所有路线

3. **打开浏览器开发者工具**（F12）

4. **切换到 Console 标签**

5. **复制并粘贴上面的代码**（推荐使用方法 3）

6. **按 Enter 执行**

7. **保存文件**（如果使用方法 3，文件会自动下载）

8. **使用批量爬取脚本**：
   ```bash
   npm run scrape:alltrails:batch -- alltrails_urls_<timestamp>.json --limit 50
   ```

## 💡 提示

- **如果页面很长**：可能需要滚动到底部以触发懒加载
- **如果提取的 URL 太少**：等待页面完全加载后再运行代码
- **如果遇到错误**：确保页面已完全加载，并且没有登录弹窗等干扰

