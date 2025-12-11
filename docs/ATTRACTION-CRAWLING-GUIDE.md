# 景点数据爬取指南

**创建日期**: 2025-01-XX  
**目的**: 从马蜂窝和飞猪爬取景点数据，补充数据库

---

## 📋 数据来源

### 1. 马蜂窝 (Mafengwo) ✅

**特点**:
- 景点数据丰富，包含详细描述、评分、图片
- 用户评价和攻略较多
- 适合获取国内景点数据

**可获取字段**:
- ✅ 景点名称
- ✅ 地址
- ✅ 评分
- ✅ 描述
- ✅ 开放时间
- ✅ 门票价格
- ✅ 联系方式（电话、网站）
- ✅ 图片
- ✅ 标签

### 2. 飞猪 (Fliggy) ✅

**特点**:
- 阿里旗下旅游平台
- 景点门票预订信息
- 价格信息较准确

**可获取字段**:
- ✅ 景点名称
- ✅ 地址
- ✅ 评分
- ✅ 门票价格
- ✅ 开放时间
- ✅ 图片

---

## 🚀 使用方法

### 爬取马蜂窝数据

```bash
# 爬取指定城市的景点
npm run scrape:mafengwo 北京 上海 杭州

# 或修改脚本中的默认关键词列表
```

### 爬取飞猪数据

```bash
# 爬取指定城市的景点
npm run scrape:fliggy 北京 上海
```

---

## ⚙️ 配置选项

可以在脚本中修改以下参数：

```typescript
const CONFIG = {
  delay: 2000,        // 请求延迟（毫秒），避免被封
  maxRetries: 3,      // 最大重试次数
  batchSize: 10,      // 批次大小
  userAgent: '...',   // User-Agent
};
```

### 建议配置：

- **稳定爬取**:
  ```typescript
  delay: 3000,        // 增加延迟，降低被封风险
  batchSize: 5,       // 减小批次
  ```

- **快速爬取**（风险较高）:
  ```typescript
  delay: 1000,
  batchSize: 20,
  ```

---

## 📊 数据流程

1. **搜索景点**: 根据关键词搜索，获取景点URL列表
2. **爬取详情**: 逐个访问景点详情页，提取数据
3. **数据清洗**: 解析和标准化数据格式
4. **保存数据库**: 检查重复，保存到Place表

---

## 🔍 数据字段映射

### 马蜂窝 → Place表

| 马蜂窝字段 | Place表字段 | 说明 |
|-----------|------------|------|
| name | name | 景点名称 |
| address | address | 地址 |
| rating | rating | 评分 |
| description | metadata.description | 描述 |
| phone | metadata.phone | 电话 |
| website | metadata.website | 网站 |
| openingHours | metadata.openingHours | 开放时间 |
| ticketPrice | metadata.ticketPrice | 门票价格 |
| tags | metadata.tags | 标签 |
| images | metadata.images | 图片 |

---

## ⚠️ 注意事项

### 1. 反爬虫机制

马蜂窝和飞猪都有反爬虫机制：

- **User-Agent**: 使用真实的浏览器User-Agent
- **请求延迟**: 设置合理的延迟（建议2-3秒）
- **请求频率**: 控制并发数量
- **IP限制**: 如果被封IP，需要更换IP或使用代理

### 2. 数据准确性

- 网站结构可能变化，需要定期更新选择器
- 部分数据可能不完整，需要验证
- 坐标信息可能需要通过其他方式获取（如高德地图API）

### 3. 法律合规

- 遵守网站的robots.txt规则
- 不要过度爬取，影响网站正常运营
- 仅用于个人学习或研究目的

---

## 🛠️ 故障排除

### 问题1: 无法获取数据

**可能原因**:
- 网站结构变化
- 反爬虫机制触发
- 网络连接问题

**解决方案**:
1. 检查网站是否可正常访问
2. 更新选择器（检查HTML结构）
3. 增加延迟时间
4. 更换User-Agent

### 问题2: 数据不完整

**可能原因**:
- 页面加载不完整
- 数据需要JavaScript渲染
- 选择器不准确

**解决方案**:
1. 使用Puppeteer等工具处理JavaScript渲染
2. 更新选择器
3. 添加数据验证

### 问题3: 被封IP

**解决方案**:
1. 使用代理IP
2. 增加延迟时间
3. 减少并发数量
4. 等待一段时间后重试

---

## 📈 优化建议

### 1. 使用代理池

```typescript
// 示例：使用代理
const axiosInstance = axios.create({
  proxy: {
    host: 'proxy.example.com',
    port: 8080,
  },
});
```

### 2. 使用Puppeteer处理JavaScript

如果网站使用JavaScript渲染，可以使用Puppeteer：

```typescript
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto(url);
const content = await page.content();
```

### 3. 数据去重

脚本已实现基本去重（根据名称），可以进一步优化：

- 根据坐标去重（距离<100m视为同一景点）
- 根据地址去重
- 合并多个数据源的数据

### 4. 增量更新

只爬取新数据，避免重复爬取：

```typescript
// 检查最后爬取时间
const lastCrawled = await prisma.place.findFirst({
  where: {
    'metadata.source': 'mafengwo',
  },
  orderBy: {
    updatedAt: 'desc',
  },
});
```

---

## 🔗 相关脚本

- **`scrape-mafengwo-attractions.ts`**: 马蜂窝爬虫
- **`scrape-fliggy-attractions.ts`**: 飞猪爬虫
- **`enrich-attractions-from-amap.ts`**: 高德地图数据补充
- **`fix-coordinates-by-name.ts`**: 坐标修正

---

## 📚 相关文档

- **景点数据采集指南**: `docs/ATTRACTION-DATA-CRAWLING-GUIDE.md`
- **POI查询失败分析**: `docs/POI-QUERY-FAILURE-ANALYSIS.md`
- **景点数据丰富化工作流**: `docs/ATTRACTION-DATA-ENRICHMENT-WORKFLOW.md`

---

## 🆘 获取帮助

如果遇到问题：

1. 检查网络连接
2. 查看错误日志
3. 验证网站结构是否变化
4. 调整配置参数

---

**最后更新**: 2025-01-XX
