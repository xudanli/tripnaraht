// 提取所有路线链接
const links = Array.from(document.querySelectorAll('a[href*="/trail/"]'))
  .map(a => a.href)
  .filter((href, index, self) => self.indexOf(href) === index)
  .map(href => href.split('?')[0].split('#')[0]);

// 创建 JSON 文本
const jsonText = JSON.stringify(links, null, 2);

// 自动下载文件（推荐）
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
console.log(`📝 前 5 个 URL:`);
links.slice(0, 5).forEach((url, i) => {
  console.log(`   ${i + 1}. ${url}`);
});
