# 🚀 快速参考指南

## 环境变量配置

在 `.env` 文件中配置：

```env
# 必需
APIFY_TOKEN=your_apify_token
DATABASE_URL=postgresql://...

# 可选（用于地址补全）
MAPBOX_ACCESS_TOKEN=your_mapbox_token
```

## 常用命令

```bash
# 抓取数据（自动补全地址）
npm run scrape

# 导入数据（自动去重和分类映射）
npm run seed

# 启动后端服务器
npm run backend:dev

# 查看 Swagger 文档
# 访问: http://localhost:3000/api
```

## 改进功能速查

### 1. 地址补全
- **触发条件**：地址长度 < 10 字符或格式异常
- **API**：Mapbox Reverse Geocoding
- **结果**：完整地址（中文）

### 2. 支付方式
- **默认策略**：冰岛 → 信用卡（Visa, Mastercard）
- **关键词**：Visa, Mastercard, NFC, Digital, Apple Pay, Alipay 等

### 3. 空间去重
- **距离阈值**：100 米
- **匹配规则**：名字相互包含视为重复
- **示例**："Blue Lagoon" vs "Blue Lagoon Parking" → 跳过

### 4. 分类映射
- **原始分类**：保存在 `metadata.rawCategory`
- **映射表**：支持中英文关键词
- **前端显示**：`"景点 · 瀑布"`

## 数据结构示例

```json
{
  "name": "黄金瀑布",
  "address": "Gullfoss, Iceland",
  "category": "ATTRACTION",
  "metadata": {
    "rawCategory": "瀑布",
    "payment": ["Credit Card", "Visa", "Mastercard"],
    "timezone": "Atlantic/Reykjavik"
  }
}
```

