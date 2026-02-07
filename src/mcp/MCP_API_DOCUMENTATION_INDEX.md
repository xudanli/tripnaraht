# MCP 服务 API 文档索引

**最后更新**: 2026-02-07  
**版本**: 1.0.0

---

## 📋 概述

本文档提供所有 MCP 服务的 API 文档索引，方便快速查找和使用。

---

## 🎯 已集成的 MCP 服务（16个）

### 1. Restaurant Direct API ⭐⭐⭐⭐⭐

**服务类型**: 直接 API 集成  
**认证方式**: JWT Bearer Token（用户级别）  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`RESTAURANT_DIRECT_FRONTEND_API.md`](./RESTAURANT_DIRECT_FRONTEND_API.md) ⭐ **推荐**

**Base URL**: `/api/restaurant`

**主要功能**:
- 餐厅搜索（支持自然语言查询）
- 餐厅详情查询
- 附近搜索
- 用户偏好管理
- 智能推荐（基于用户偏好和上下文）

**快速开始**:
```bash
# 检查服务状态
curl http://localhost:3000/api/restaurant/health \
  -H "Authorization: Bearer {token}"

# 搜索餐厅
curl -X POST http://localhost:3000/api/restaurant/search \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "附近好吃的意大利餐厅",
    "location": {"lat": 40.7128, "lng": -74.0060},
    "minRating": 4.0
  }'

# 智能推荐
curl -X POST http://localhost:3000/api/restaurant/recommend \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {"lat": 40.7128, "lng": -74.0060}
  }'
```

---

### 2. Currency Exchange Direct API ⭐⭐⭐⭐

**服务类型**: 直接 API 集成  
**认证方式**: JWT Bearer Token（用户级别）  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`RESTAURANT_DIRECT_FRONTEND_API.md`](./RESTAURANT_DIRECT_FRONTEND_API.md) ⭐ **推荐**

**Base URL**: `/api/restaurant`

**主要功能**:
- 餐厅搜索（支持自然语言查询）
- 餐厅详情查询
- 附近搜索
- 用户偏好管理
- 智能推荐（基于用户偏好和上下文）

**快速开始**:
```bash
# 检查服务状态
curl http://localhost:3000/api/restaurant/health \
  -H "Authorization: Bearer {token}"

# 搜索餐厅
curl -X POST http://localhost:3000/api/restaurant/search \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "附近好吃的意大利餐厅",
    "location": {"lat": 40.7128, "lng": -74.0060},
    "minRating": 4.0
  }'

# 智能推荐
curl -X POST http://localhost:3000/api/restaurant/recommend \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {"lat": 40.7128, "lng": -74.0060}
  }'
```

---

### 2. Currency Exchange Direct API ⭐⭐⭐⭐

**服务类型**: 直接 API 集成  
**认证方式**: JWT Bearer Token（用户级别）  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`CURRENCY_DIRECT_FRONTEND_API.md`](./CURRENCY_DIRECT_FRONTEND_API.md) ⭐ **推荐**

**Base URL**: `/api/currency`

**主要功能**:
- 实时汇率查询
- 货币转换
- 历史汇率查询
- 汇率趋势分析
- 批量货币转换
- 用户货币偏好设置

**快速开始**:
```bash
# 检查服务状态
curl http://localhost:3000/api/currency/health \
  -H "Authorization: Bearer {token}"

# 获取最新汇率
curl "http://localhost:3000/api/currency/latest?base=USD&symbols=EUR,GBP,JPY" \
  -H "Authorization: Bearer {token}"

# 货币转换
curl -X POST http://localhost:3000/api/currency/convert \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "from": "USD",
    "to": "EUR"
  }'
```

---

### 3. Hotel Direct API ⭐⭐⭐⭐

**服务类型**: 直接 API 集成  
**认证方式**: JWT Bearer Token（用户级别）  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`HOTEL_DIRECT_FRONTEND_API.md`](./HOTEL_DIRECT_FRONTEND_API.md) ⭐ **推荐**

**Base URL**: `/api/hotel`

**主要功能**:
- 酒店搜索（支持自然语言查询）
- 酒店详情查询
- 附近搜索
- 用户偏好管理
- 智能推荐（基于用户偏好和上下文）

**快速开始**:
```bash
# 检查服务状态
curl http://localhost:3000/api/hotel/health \
  -H "Authorization: Bearer {token}"

# 搜索酒店
curl -X POST http://localhost:3000/api/hotel/search \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "纽约市中心酒店",
    "location": {"lat": 40.7128, "lng": -74.0060},
    "minRating": 4.0
  }'

# 智能推荐
curl -X POST http://localhost:3000/api/hotel/recommend \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {"lat": 40.7128, "lng": -74.0060},
    "checkIn": "2026-02-15",
    "checkOut": "2026-02-20"
  }'
```

---

### 4. Stripe Direct API ⭐⭐⭐⭐⭐

**服务类型**: 直接 API 集成  
**认证方式**: JWT Bearer Token（用户级别）  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`STRIPE_DIRECT_FRONTEND_API.md`](./STRIPE_DIRECT_FRONTEND_API.md) ⭐ **推荐**
- **集成文档**: [`STRIPE_DIRECT_API.md`](./STRIPE_DIRECT_API.md)

**Base URL**: `/api/stripe`

**主要功能**:
- 创建支付意图
- 确认支付
- 查询支付状态
- 处理退款
- 支付历史查询
- Stripe Connect OAuth（平台模式）

**快速开始**:
```bash
# 检查服务状态
curl http://localhost:3000/api/stripe/health \
  -H "Authorization: Bearer {token}"

# 创建支付意图
curl -X POST http://localhost:3000/api/stripe/payment-intent \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000, "currency": "usd"}'
```

---

### 4. Translation Direct API ⭐⭐⭐⭐

**服务类型**: 直接 API 集成  
**认证方式**: JWT Bearer Token（用户级别）  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`TRANSLATION_DIRECT_FRONTEND_API.md`](./TRANSLATION_DIRECT_FRONTEND_API.md) ⭐ **推荐**

**Base URL**: `/api/translation`

**主要功能**:
- 文本翻译（支持单个和批量）
- 语言检测
- 获取支持的语言列表
- 用户翻译设置管理
- 智能翻译（基于用户设置）

**快速开始**:
```bash
# 检查服务状态
curl http://localhost:3000/api/translation/health \
  -H "Authorization: Bearer {token}"

# 翻译文本
curl -X POST http://localhost:3000/api/translation/translate \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, world!",
    "target": "zh"
  }'

# 智能翻译（基于用户设置）
curl -X POST http://localhost:3000/api/translation/smart-translate \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Good morning",
    "targetLanguage": "ja"
  }'
```

---

### 5. Image Direct API ⭐⭐⭐⭐

**服务类型**: 直接 API 集成  
**认证方式**: JWT Bearer Token（用户级别）  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`IMAGE_DIRECT_FRONTEND_API.md`](./IMAGE_DIRECT_FRONTEND_API.md) ⭐ **推荐**

**Base URL**: `/api/image`

**主要功能**:
- 图片搜索（支持关键词、方向、颜色等过滤）
- 获取图片详情
- 获取推荐图片
- 用户图片偏好管理
- 智能推荐（基于用户偏好）

**快速开始**:
```bash
# 检查服务状态
curl http://localhost:3000/api/image/health \
  -H "Authorization: Bearer {token}"

# 搜索图片
curl -X POST http://localhost:3000/api/image/search \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "nature landscape",
    "perPage": 10
  }'

# 智能推荐（基于用户偏好）
curl -X POST http://localhost:3000/api/image/recommend \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "travel"
  }'
```

---

### 6. Google Maps Direct API ⭐⭐⭐⭐⭐

**服务类型**: 直接 API 集成  
**认证方式**: API Key（服务级别）  
**状态**: ✅ 生产可用

**文档**:
- **集成文档**: [`GOOGLE_MAPS_DIRECT_INTEGRATION.md`](./GOOGLE_MAPS_DIRECT_INTEGRATION.md)

**Base URL**: `/api/google-maps-direct`

**主要功能**:
- 路线规划
- 距离矩阵计算
- 地理编码/反向地理编码
- 地点搜索

**快速开始**:
```bash
curl http://localhost:3000/api/google-maps-direct/health
```

---

### 6. Weather Direct API ⭐⭐⭐⭐⭐

**服务类型**: 直接 API 集成  
**认证方式**: 无需认证（免费）  
**状态**: ✅ 生产可用

**文档**:
- **API 文档**: [`WEATHER_DIRECT_API.md`](./WEATHER_DIRECT_API.md) ⭐

**Base URL**: `/api/weather-direct`

**主要功能**:
- 当前天气查询
- 多日天气预报
- 时区查询

**快速开始**:
```bash
curl http://localhost:3000/api/weather-direct/health
curl "http://localhost:3000/api/weather-direct/current?city=New%20York"
```

---

### 7. Google Calendar MCP ⭐⭐⭐⭐⭐

**服务类型**: 远程 HTTP/SSE MCP 服务器  
**认证方式**: OAuth 2.0  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`GOOGLE_CALENDAR_FRONTEND_API.md`](./GOOGLE_CALENDAR_FRONTEND_API.md) ⭐
- **集成文档**: [`GOOGLE_CALENDAR_INTEGRATION.md`](./GOOGLE_CALENDAR_INTEGRATION.md)
- **快速开始**: [`GOOGLE_CALENDAR_QUICKSTART.md`](./GOOGLE_CALENDAR_QUICKSTART.md)

**Base URL**: `/api/google-calendar`

**主要功能**:
- 事件管理（创建、读取、更新、删除）
- 日历管理
- 空闲时间查找
- 自然语言快速添加

**快速开始**:
```bash
curl http://localhost:3000/api/google-calendar/health
```

---

### 8. Airbnb MCP ⭐⭐⭐⭐

**服务类型**: 本地 stdio MCP 服务器（npm 包）  
**认证方式**: 无需认证  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`AIRBNB_FRONTEND_API.md`](./AIRBNB_FRONTEND_API.md) ⭐
- **集成文档**: [`AIRBNB_INTEGRATION.md`](./AIRBNB_INTEGRATION.md)

**Base URL**: `/api/airbnb`

**主要功能**:
- 房源搜索
- 房源详情查询

**快速开始**:
```bash
curl http://localhost:3000/api/airbnb/health
```

---

### 9. Amadeus MCP ⭐⭐⭐⭐

**服务类型**: 远程 HTTP/SSE MCP 服务器  
**认证方式**: API Key  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`AMADEUS_FRONTEND_API.md`](./AMADEUS_FRONTEND_API.md) ⭐
- **集成文档**: [`AMADEUS_INTEGRATION.md`](./AMADEUS_INTEGRATION.md)
- **快速开始**: [`AMADEUS_QUICKSTART.md`](./AMADEUS_QUICKSTART.md)

**Base URL**: `/api/amadeus`

**主要功能**:
- 航班搜索
- 航班价格查询

**快速开始**:
```bash
curl http://localhost:3000/api/amadeus/ping
```

---

### 10. PostgreSQL MCP ⭐⭐⭐⭐

**服务类型**: 远程 HTTP/SSE MCP 服务器  
**认证方式**: 数据库连接字符串  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`POSTGRESQL_MCP_FRONTEND_API.md`](./POSTGRESQL_MCP_FRONTEND_API.md) ⭐

**Base URL**: `/api/postgresql-mcp`

**主要功能**:
- SQL 查询（SELECT）
- SQL 执行（INSERT/UPDATE/DELETE）
- 性能监控
- 慢查询监控

**快速开始**:
```bash
curl http://localhost:3000/api/postgresql-mcp/health
```

---

### 11. Browserbase MCP ⭐⭐⭐⭐

**服务类型**: 远程 HTTP/SSE MCP 服务器  
**认证方式**: API Key  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`BROWSERBASE_MCP_FRONTEND_API.md`](./BROWSERBASE_MCP_FRONTEND_API.md) ⭐

**Base URL**: `/api/browserbase-mcp`

**主要功能**:
- 浏览器会话管理
- 页面导航和截图
- 元素交互（点击、输入）
- JavaScript 执行

**快速开始**:
```bash
curl http://localhost:3000/api/browserbase-mcp/health
```

---

### 12. Exa MCP ⭐⭐⭐⭐

**服务类型**: 远程 HTTP/SSE MCP 服务器  
**认证方式**: API Key  
**状态**: ✅ 生产可用

**文档**:
- **前端 API 文档**: [`EXA_FRONTEND_API.md`](./EXA_FRONTEND_API.md) ⭐

**Base URL**: `/api/exa`

**主要功能**:
- Web 搜索
- 代码搜索
- 公司研究
- 深度研究
- 人员搜索

**快速开始**:
```bash
curl http://localhost:3000/api/exa/status
```

---

### 13. File Extractor MCP ⭐⭐⭐

**服务类型**: 远程 HTTP/SSE MCP 服务器  
**认证方式**: OAuth 2.0（可选）  
**状态**: ✅ 已集成

**文档**:
- **前端 API 文档**: [`FILE_EXTRACTOR_MCP_FRONTEND_API.md`](./FILE_EXTRACTOR_MCP_FRONTEND_API.md) ⭐
- **Direct API 文档**: [`FILE_EXTRACTOR_DIRECT_API.md`](./FILE_EXTRACTOR_DIRECT_API.md) ⭐（无需认证）

**Base URL**: `/api/file-extractor-mcp`（MCP）或 `/api/file-extractor-direct`（Direct）

**主要功能**:
- 文件元数据提取
- 文件内容提取（PDF、DOCX、XLSX 等）

**快速开始**:
```bash
curl http://localhost:3000/api/file-extractor-mcp/health
```

---

### 14. Rail MCP ⭐⭐⭐⭐

**服务类型**: 远程 HTTP/SSE MCP 服务器  
**认证方式**: OAuth 2.0  
**状态**: ✅ 已集成（需要认证）

**文档**:
- **集成文档**: [`RAIL_MCP_INTEGRATION.md`](./RAIL_MCP_INTEGRATION.md)

**主要功能**:
- 铁路路线搜索
- 时刻表查询
- 车票可用性检查

**注意**: 工具列表在连接时动态发现

---

## 📊 文档类型说明

### 前端 API 文档（推荐）

格式：`{SERVICE}_FRONTEND_API.md`

包含：
- ✅ 完整的 API 端点列表
- ✅ 请求/响应格式
- ✅ 数据模型定义
- ✅ 错误处理说明
- ✅ 使用示例
- ✅ 快速开始指南

**适用于**: 前端开发人员、API 集成

---

### 集成文档

格式：`{SERVICE}_INTEGRATION.md`

包含：
- ✅ 服务概述
- ✅ 集成方式
- ✅ 配置说明
- ✅ 认证流程
- ✅ 使用场景

**适用于**: 后端开发人员、系统集成

---

### Direct API 文档

格式：`{SERVICE}_DIRECT_API.md`

包含：
- ✅ 直接 API 集成说明
- ✅ 数据库模型
- ✅ 安全考虑
- ✅ 与 MCP 版本的区别

**适用于**: 需要直接 API 集成的场景

---

## 🎯 按功能分类

### 餐饮
- ✅ **Restaurant Direct API** - 餐厅搜索、推荐、用户偏好管理

### 住宿
- ✅ **Hotel Direct API** - 酒店搜索、推荐、用户偏好管理
- ✅ **Airbnb MCP** - 房源搜索、详情查询

### 货币和支付
- ✅ **Currency Exchange Direct API** - 汇率转换、趋势分析、用户偏好设置
- ✅ **Stripe Direct API** - 支付处理、退款、支付历史

### 翻译和语言
- ✅ **Translation Direct API** - 文本翻译、语言检测、用户翻译设置

### 图片和视觉
- ✅ **Image Direct API** - 图片搜索、推荐、用户偏好管理（Pexels + Unsplash）
- ✅ **Stripe Direct API** - 支付处理、退款、支付历史

### 地图和位置
- ✅ **Google Maps Direct API** - 路线规划、地理编码、地点搜索

### 天气
- ✅ **Weather Direct API** - 天气查询、天气预报

### 日历
- ✅ **Google Calendar MCP** - 事件管理、日历管理

### 住宿
- ✅ **Airbnb MCP** - 房源搜索、详情查询

### 交通
- ✅ **Amadeus MCP** - 航班搜索
- ✅ **Rail MCP** - 铁路查询

### 数据
- ✅ **PostgreSQL MCP** - 数据库操作
- ✅ **File Extractor MCP** - 文件内容提取

### 自动化
- ✅ **Browserbase MCP** - 浏览器自动化

### 搜索
- ✅ **Exa MCP** - Web 搜索、代码搜索、研究

---

## 🔍 快速查找

### 按认证方式

| 认证方式 | 服务 |
|---------|------|
| **JWT Bearer Token** | Restaurant Direct API, Currency Exchange Direct API, Hotel Direct API, Stripe Direct API |
| **API Key** | Google Maps Direct, Amadeus, Browserbase, Exa |
| **OAuth 2.0** | Google Calendar, Rail, File Extractor MCP |
| **无需认证** | Weather Direct, Airbnb |
| **数据库连接** | PostgreSQL MCP |

### 按服务类型

| 服务类型 | 服务 |
|---------|------|
| **Direct API** | Stripe, Google Maps, Weather, File Extractor Direct |
| **MCP Server** | Google Calendar, Airbnb, Amadeus, PostgreSQL, Browserbase, Exa, Rail, File Extractor MCP |

---

## 📝 文档更新记录

| 日期 | 更新内容 |
|------|---------|
| 2026-02-07 | 添加 Image Direct API 文档索引 |
| 2026-02-07 | 添加 Translation Direct API 文档索引 |
| 2026-02-07 | 添加 Hotel Direct API 文档索引 |
| 2026-02-07 | 添加 Currency Exchange Direct API 文档索引 |
| 2026-02-07 | 添加 Restaurant Direct API 文档索引 |
| 2026-02-07 | 添加 Stripe Direct API 文档索引 |
| 2026-02-06 | 初始版本 |

---

## 🔗 相关资源

- [MCP 服务器集成总结](./MCP_SERVERS_SUMMARY.md)
- [MCP 能力清单与产品路线图](./MCP_CAPABILITIES_AND_ROADMAP.md)
- [MCP 服务评估](./MCP_SERVICES_EVALUATION.md)

---

**维护**: 开发团队  
**反馈**: 如有问题或建议，请提交 Issue 或 PR
