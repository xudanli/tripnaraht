# 规划助手与行程助手 MCP 能力配置指南

**文档版本**: v1.0  
**更新日期**: 2026-02-07  
**目标受众**: AI 科学家、产品经理、开发团队

---

## 📋 概述

本文档定义**规划助手**（Planning Assistant）和**行程助手**（Trip Planner / Journey Assistant）智能体应该拥有的 MCP 能力，以确保它们能够高效完成各自的职责。

---

## 🎯 智能体职责定位

### 1. 规划助手 (Planning Assistant)

**定位**: 用户交互层入口，帮用户"想清楚"去哪里、怎么玩（从零开始）

**核心职责**:
- ✅ **对话引导** - 引导式多轮对话，收集用户需求
- ✅ **参数收集** - 收集用户偏好、约束条件
- ✅ **结果展示/解释** - 格式化输出、人格化表达
- ✅ **触发编排动作** - 通过 CoreGateway 触发核心动作

**典型场景**:
- 用户说"我想去冰岛"，助手引导收集：时间、预算、偏好、人数等
- 用户说"推荐几个目的地"，助手搜索、对比、推荐
- 用户说"帮我规划一个7天的行程"，助手生成方案并解释

---

### 2. 行程助手 (Trip Planner)

**定位**: 已创建行程的智能优化/细化/咨询/执行助手

**核心职责**:
- ✅ **行程优化师** - 调整 POI 顺序、替换景点、优化节奏
- ✅ **行程细化师** - 安排每日具体活动、餐厅、交通
- ✅ **行程顾问** - 回答问题、给建议、风险提示
- ✅ **执行助手** - 预订提醒、行前准备、实时调整

**典型场景**:
- 用户说"这个路线太赶了"，助手优化节奏、重新分配时间
- 用户说"帮我安排今天的餐厅"，助手搜索附近餐厅、推荐、预订
- 用户说"这个景点值得去吗？"，助手查询信息、对比、给建议
- 用户说"提醒我明天要预订酒店"，助手创建提醒、同步日历

---

### 3. 旅程助手 (Journey Assistant)

**定位**: 陪用户"走完"整个旅程（执行阶段）

**核心职责**:
- ✅ **对话响应** - 旅途中的问答、导航、推荐
- ✅ **状态展示** - 展示当前行程状态、提醒
- ✅ **下发变更意图** - 通过 CoreGateway.applyChangeIntent() 触发变更
- ✅ **触发编排动作** - 通过 CoreGateway 触发核心动作

**典型场景**:
- 用户说"我现在在哪里？"，助手展示当前位置、下一个目的地
- 用户说"附近有什么好吃的？"，助手搜索、推荐、导航
- 用户说"天气怎么样？"，助手查询天气、给建议
- 用户说"帮我改签航班"，助手查询、对比、预订

---

## 🔧 MCP 能力配置矩阵

### 规划助手 (Planning Assistant) - 推荐 MCP 能力

| 能力类别 | MCP 服务 | 优先级 | 使用场景 | 工具示例 |
|---------|---------|--------|---------|---------|
| **目的地探索** | Exa MCP | ⭐⭐⭐⭐⭐ | 搜索目的地信息、研究景点 | `web_search_exa`, `deep_search_exa` |
| **目的地探索** | Google Maps Direct | ⭐⭐⭐⭐⭐ | 地点搜索、地理编码 | `google_maps.searchPlaces`, `google_maps.geocode` |
| **目的地探索** | Image Direct API | ⭐⭐⭐⭐ | 获取目的地图片、视觉参考 | `image.search`, `image.recommend` |
| **图片处理** | Vision Service + OCR | ⭐⭐⭐⭐ | OCR提取文字、图片识别地点、反向图片搜索 | `vision.poiRecommend`, `ocr.extractText` |
| **图片翻译** | Vision + Translation | ⭐⭐⭐⭐ | 用户上传图片，OCR提取文字并翻译 | `vision.poiRecommend` + `translation.translate` |
| **住宿搜索** | Airbnb MCP | ⭐⭐⭐⭐ | 搜索民宿、获取房源信息 | `airbnb.search`, `airbnb.listingDetails` |
| **住宿搜索** | Hotel Direct API | ⭐⭐⭐⭐⭐ | 搜索酒店、对比价格 | `hotel.search`, `hotel.recommend` |
| **交通查询** | Amadeus MCP | ⭐⭐⭐⭐ | 搜索航班、对比价格 | `amadeus.searchFlights` |
| **交通查询** | Rail MCP | ⭐⭐⭐⭐ | 搜索铁路路线、时刻表 | `rail.searchRoutes` |
| **天气查询** | Weather Direct API | ⭐⭐⭐⭐ | 查询目的地天气、影响规划 | `weather.getCurrentWeather`, `weather.getWeatherByDatetimeRange` |
| **货币转换** | Currency Direct API | ⭐⭐⭐ | 显示不同货币的价格 | `currency.convert`, `currency.getRates` |
| **翻译服务** | Translation Direct API | ⭐⭐⭐ | 翻译目的地信息、多语言支持 | `translation.translate`, `translation.detectLanguage` |
| **数据库操作** | PostgreSQL MCP | ⭐⭐⭐⭐ | 查询用户历史、偏好数据 | `postgresql.query` |
| **文件处理** | File Extractor MCP | ⭐⭐ | 处理用户上传的行程文件 | `file_extractor.extract_file_content` |

**核心能力总结**:
- ✅ **信息收集**: Exa Web搜索、Google Maps地点搜索、图片识别
- ✅ **住宿推荐**: Airbnb + Hotel Direct API
- ✅ **交通规划**: Amadeus航班 + Rail铁路
- ✅ **决策支持**: 天气、货币、翻译、图片翻译

---

### 行程助手 (Trip Planner) - 推荐 MCP 能力

| 能力类别 | MCP 服务 | 优先级 | 使用场景 | 工具示例 |
|---------|---------|--------|---------|---------|
| **路线优化** | Google Maps Direct | ⭐⭐⭐⭐⭐ | 路线规划、距离计算、优化顺序 | `google_maps.getRoute`, `google_maps.computeDistanceMatrix` |
| **POI搜索** | Google Maps Direct | ⭐⭐⭐⭐⭐ | 搜索景点、餐厅、酒店 | `google_maps.searchPlaces` |
| **POI搜索** | Restaurant Direct API | ⭐⭐⭐⭐⭐ | 搜索餐厅、推荐、预订 | `restaurant.search`, `restaurant.recommend` |
| **POI搜索** | Hotel Direct API | ⭐⭐⭐⭐⭐ | 搜索酒店、推荐、预订 | `hotel.search`, `hotel.recommend` |
| **POI搜索** | Image Direct API | ⭐⭐⭐⭐ | 获取景点图片、视觉参考 | `image.search` |
| **图片识别** | Vision Service + OCR | ⭐⭐⭐⭐ | 用户上传图片识别地点、OCR提取文字、反向图片搜索 | `vision.poiRecommend`, `ocr.extractText` |
| **图片翻译** | Vision + Translation | ⭐⭐⭐⭐ | 用户上传图片，OCR提取文字并翻译（菜单、路牌等） | `vision.poiRecommend` + `translation.translate` |
| **交通规划** | Google Maps Direct | ⭐⭐⭐⭐⭐ | 计算交通时间、路线 | `google_maps.getRoute`, `google_maps.computeDistanceMatrix` |
| **交通规划** | Amadeus MCP | ⭐⭐⭐⭐ | 查询航班、改签 | `amadeus.searchFlights` |
| **交通规划** | Rail MCP | ⭐⭐⭐⭐ | 查询铁路、改签 | `rail.searchRoutes` |
| **天气查询** | Weather Direct API | ⭐⭐⭐⭐⭐ | 查询天气、影响活动安排 | `weather.getCurrentWeather`, `weather.getWeatherByDatetimeRange` |
| **日历管理** | Google Calendar MCP | ⭐⭐⭐⭐⭐ | 同步行程到日历、创建提醒 | `create_event`, `find_free_slots`, `quick_add` |
| **支付处理** | Stripe Direct API | ⭐⭐⭐⭐⭐ | 处理预订支付、退款 | `stripe.createPaymentIntent`, `stripe.confirmPayment` |
| **信息查询** | Exa MCP | ⭐⭐⭐⭐ | 查询景点信息、评价 | `web_search_exa`, `deep_search_exa` |
| **翻译服务** | Translation Direct API | ⭐⭐⭐ | 翻译景点信息、多语言支持 | `translation.translate` |
| **数据库操作** | PostgreSQL MCP | ⭐⭐⭐⭐ | 查询行程数据、更新状态 | `postgresql.query`, `postgresql.execute` |

**核心能力总结**:
- ✅ **路线优化**: Google Maps路线规划、距离计算
- ✅ **POI管理**: Google Maps + Restaurant + Hotel + Image搜索 + 图片识别
- ✅ **交通规划**: Google Maps + Amadeus + Rail
- ✅ **执行支持**: Google Calendar同步、Stripe支付、Weather天气
- ✅ **图片处理**: OCR提取文字、图片识别地点、图片翻译

---

### 旅程助手 (Journey Assistant) - 推荐 MCP 能力

| 能力类别 | MCP 服务 | 优先级 | 使用场景 | 工具示例 |
|---------|---------|--------|---------|---------|
| **实时导航** | Google Maps Direct | ⭐⭐⭐⭐⭐ | 当前位置、导航、路线 | `google_maps.getRoute`, `google_maps.computeDistanceMatrix` |
| **附近搜索** | Google Maps Direct | ⭐⭐⭐⭐⭐ | 搜索附近餐厅、景点、服务 | `google_maps.searchPlaces` |
| **附近搜索** | Restaurant Direct API | ⭐⭐⭐⭐⭐ | 搜索附近餐厅、推荐 | `restaurant.search`, `restaurant.nearby` |
| **天气查询** | Weather Direct API | ⭐⭐⭐⭐⭐ | 实时天气、预警 | `weather.getCurrentWeather` |
| **日历管理** | Google Calendar MCP | ⭐⭐⭐⭐⭐ | 查看日程、创建提醒 | `events_list`, `create_event`, `get_current_date_time` |
| **支付处理** | Stripe Direct API | ⭐⭐⭐⭐ | 紧急支付、改签费用 | `stripe.createPaymentIntent` |
| **信息查询** | Exa MCP | ⭐⭐⭐⭐ | 查询实时信息、紧急情况 | `web_search_exa` |
| **翻译服务** | Translation Direct API | ⭐⭐⭐⭐ | 翻译菜单、路牌、对话 | `translation.translate` |
| **图片翻译** | Vision + Translation | ⭐⭐⭐⭐⭐ | 用户上传图片，OCR提取文字并翻译（菜单、路牌、景点介绍等） | `vision.poiRecommend` + `translation.translate` |
| **图片识别** | Vision Service + OCR | ⭐⭐⭐⭐ | 用户上传图片识别地点、反向图片搜索 | `vision.poiRecommend`, `ocr.extractText` |
| **货币转换** | Currency Direct API | ⭐⭐⭐ | 实时汇率、价格转换 | `currency.convert` |
| **数据库操作** | PostgreSQL MCP | ⭐⭐⭐⭐ | 更新行程状态、记录事件 | `postgresql.execute` |

**核心能力总结**:
- ✅ **实时导航**: Google Maps实时路线、导航
- ✅ **附近服务**: Google Maps + Restaurant附近搜索
- ✅ **实时信息**: Weather天气、Exa实时搜索
- ✅ **执行支持**: Google Calendar提醒、Stripe支付、Translation翻译
- ✅ **图片处理**: OCR提取文字、图片识别地点、图片翻译（菜单、路牌等）

---

## 📊 能力优先级矩阵

### P0 - 核心必需能力（必须拥有）

#### 规划助手
1. **Exa MCP** - Web搜索、目的地研究 ⭐⭐⭐⭐⭐
2. **Google Maps Direct** - 地点搜索、地理编码 ⭐⭐⭐⭐⭐
3. **Hotel Direct API** - 酒店搜索、推荐 ⭐⭐⭐⭐⭐
4. **Weather Direct API** - 天气查询 ⭐⭐⭐⭐
5. **Vision Service + OCR** - 图片识别地点、OCR提取文字 ⭐⭐⭐⭐
6. **Translation Direct API** - 翻译服务、图片翻译 ⭐⭐⭐⭐

#### 行程助手
1. **Google Maps Direct** - 路线规划、POI搜索 ⭐⭐⭐⭐⭐
2. **Restaurant Direct API** - 餐厅搜索、推荐 ⭐⭐⭐⭐⭐
3. **Hotel Direct API** - 酒店搜索、推荐 ⭐⭐⭐⭐⭐
4. **Weather Direct API** - 天气查询 ⭐⭐⭐⭐⭐
5. **Google Calendar MCP** - 日历同步、提醒 ⭐⭐⭐⭐⭐
6. **Stripe Direct API** - 支付处理 ⭐⭐⭐⭐⭐
7. **Vision Service + OCR** - 图片识别地点、OCR提取文字 ⭐⭐⭐⭐
8. **Translation Direct API** - 翻译服务、图片翻译 ⭐⭐⭐⭐

#### 旅程助手
1. **Google Maps Direct** - 实时导航、附近搜索 ⭐⭐⭐⭐⭐
2. **Restaurant Direct API** - 附近餐厅搜索 ⭐⭐⭐⭐⭐
3. **Weather Direct API** - 实时天气 ⭐⭐⭐⭐⭐
4. **Google Calendar MCP** - 日程查看、提醒 ⭐⭐⭐⭐⭐
5. **Vision Service + OCR** - 图片识别地点、OCR提取文字 ⭐⭐⭐⭐⭐
6. **Translation Direct API** - 图片翻译（菜单、路牌等） ⭐⭐⭐⭐⭐

---

### P1 - 高优先级能力（强烈推荐）

#### 规划助手
1. **Airbnb MCP** - 民宿搜索（补充酒店） ⭐⭐⭐⭐
2. **Amadeus MCP** - 航班搜索 ⭐⭐⭐⭐
3. **Rail MCP** - 铁路查询 ⭐⭐⭐⭐
4. **Image Direct API** - 目的地图片、视觉参考 ⭐⭐⭐⭐
5. **PostgreSQL MCP** - 用户数据查询 ⭐⭐⭐⭐

#### 行程助手
1. **Amadeus MCP** - 航班查询、改签 ⭐⭐⭐⭐
2. **Rail MCP** - 铁路查询、改签 ⭐⭐⭐⭐
3. **Image Direct API** - 景点图片、视觉参考 ⭐⭐⭐⭐
4. **Exa MCP** - 景点信息查询 ⭐⭐⭐⭐
5. **PostgreSQL MCP** - 行程数据操作 ⭐⭐⭐⭐

#### 旅程助手
1. **Stripe Direct API** - 紧急支付 ⭐⭐⭐⭐
2. **Exa MCP** - 实时信息查询 ⭐⭐⭐⭐
3. **Currency Direct API** - 汇率查询 ⭐⭐⭐

---

### P2 - 可选能力（按需添加）

#### 规划助手
1. **Currency Direct API** - 货币转换 ⭐⭐⭐
2. **Translation Direct API** - 翻译服务 ⭐⭐⭐
3. **File Extractor MCP** - 文件处理 ⭐⭐

#### 行程助手
1. **Translation Direct API** - 翻译服务 ⭐⭐⭐
2. **Currency Direct API** - 货币转换 ⭐⭐⭐

#### 旅程助手
1. **Currency Direct API** - 汇率查询 ⭐⭐⭐

---

## 🎯 能力使用场景映射

### 规划助手典型流程

```
用户: "我想去冰岛"
  ↓
1. Exa MCP → 搜索冰岛信息、景点、最佳时间
2. Google Maps → 搜索主要城市、地点
3. Image Direct API → 获取冰岛图片（视觉参考）
  ↓
用户: "帮我规划一个7天的行程"
  ↓
4. Weather Direct API → 查询冰岛天气（影响活动推荐）
5. Hotel Direct API → 搜索酒店（根据预算、位置）
6. Airbnb MCP → 搜索民宿（补充选择）
7. Amadeus MCP → 搜索航班（往返）
8. Rail MCP → 查询铁路（如果适用）
  ↓
生成方案并解释

用户: "上传图片"（用户上传了一张地标照片）
  ↓
9. Vision Service + OCR → 识别图片中的地标、提取文字
10. Google Maps → 根据识别结果搜索地点
11. Translation Direct API → 如果文字是外语，翻译成用户语言
  ↓
返回识别结果和地点信息
```

### 行程助手典型流程

```
用户: "帮我安排今天的餐厅"
  ↓
1. Google Maps Direct → 获取当前位置
2. Restaurant Direct API → 搜索附近餐厅
3. Weather Direct API → 查询天气（影响推荐）
4. Image Direct API → 获取餐厅图片
  ↓
用户: "预订这家餐厅"
  ↓
5. Stripe Direct API → 处理预订支付
6. Google Calendar MCP → 创建日历事件
  ↓
完成预订并提醒
```

### 旅程助手典型流程

```
用户: "附近有什么好吃的？"
  ↓
1. Google Maps Direct → 获取当前位置
2. Restaurant Direct API → 搜索附近餐厅
  ↓
用户: "上传菜单图片"（用户上传餐厅菜单）
  ↓
3. Vision Service + OCR → 提取菜单文字
4. Translation Direct API → 翻译菜单文字
  ↓
返回翻译后的菜单

用户: "帮我导航到这家餐厅"
  ↓
5. Google Maps Direct → 计算路线、导航
6. Google Calendar MCP → 更新行程状态
  ↓
开始导航

用户: "上传图片"（用户上传路牌或景点介绍牌）
  ↓
7. Vision Service + OCR → 提取文字
8. Translation Direct API → 翻译文字
9. Google Maps → 如果识别到地点名称，搜索地点
  ↓
返回翻译结果和地点信息
```

---

## 🔐 认证要求

### 用户级别认证（需要用户授权）
- **Google Calendar MCP** - OAuth 2.0
- **Stripe Direct API** - JWT Bearer Token
- **Restaurant Direct API** - JWT Bearer Token
- **Hotel Direct API** - JWT Bearer Token
- **Currency Direct API** - JWT Bearer Token
- **Translation Direct API** - JWT Bearer Token
- **Image Direct API** - JWT Bearer Token

### 服务级别认证（管理员配置）
- **Google Maps Direct** - API Key
- **Weather Direct API** - 无需认证（免费）
- **Exa MCP** - API Key
- **Amadeus MCP** - API Key
- **Rail MCP** - OAuth 2.0（首次需要）
- **Airbnb MCP** - 无需认证
- **PostgreSQL MCP** - 数据库连接字符串

---

## 📝 实施建议

### 阶段一：核心能力（P0）
**时间**: 1-2周  
**目标**: 确保智能体具备基本功能

**规划助手**:
- ✅ Exa MCP
- ✅ Google Maps Direct
- ✅ Hotel Direct API
- ✅ Weather Direct API

**行程助手**:
- ✅ Google Maps Direct
- ✅ Restaurant Direct API
- ✅ Hotel Direct API
- ✅ Weather Direct API
- ✅ Google Calendar MCP
- ✅ Stripe Direct API

**旅程助手**:
- ✅ Google Maps Direct
- ✅ Restaurant Direct API
- ✅ Weather Direct API
- ✅ Google Calendar MCP

### 阶段二：增强能力（P1）
**时间**: 2-3周  
**目标**: 提升智能体能力，覆盖更多场景

**规划助手**:
- ✅ Airbnb MCP
- ✅ Amadeus MCP
- ✅ Rail MCP
- ✅ Image Direct API
- ✅ PostgreSQL MCP

**行程助手**:
- ✅ Amadeus MCP
- ✅ Rail MCP
- ✅ Image Direct API
- ✅ Exa MCP
- ✅ PostgreSQL MCP

**旅程助手**:
- ✅ Stripe Direct API
- ✅ Translation Direct API
- ✅ Exa MCP
- ✅ Currency Direct API

### 阶段三：可选能力（P2）
**时间**: 按需  
**目标**: 根据用户反馈和业务需求添加

---

## 🎨 能力组合策略

### 规划助手 - "探索者"组合
```
信息收集层: Exa + Google Maps + Image + Vision/OCR
    ↓
住宿推荐层: Hotel + Airbnb
    ↓
交通规划层: Amadeus + Rail
    ↓
决策支持层: Weather + Currency + Translation + Vision/OCR
```

### 行程助手 - "优化师"组合
```
路线优化层: Google Maps
    ↓
POI管理层: Google Maps + Restaurant + Hotel + Image + Vision/OCR
    ↓
交通规划层: Google Maps + Amadeus + Rail
    ↓
执行支持层: Calendar + Stripe + Weather + Vision/OCR + Translation
```

### 旅程助手 - "陪伴者"组合
```
实时导航层: Google Maps
    ↓
附近服务层: Google Maps + Restaurant
    ↓
实时信息层: Weather + Exa
    ↓
执行支持层: Calendar + Stripe + Translation + Vision/OCR
```

---

## 📚 相关文档

- [MCP 能力清单与产品路线图](../mcp/MCP_CAPABILITIES_AND_ROADMAP.md)
- [MCP 服务器集成总结](../mcp/MCP_SERVERS_SUMMARY.md)
- [MCP API 文档索引](../mcp/MCP_API_DOCUMENTATION_INDEX.md)
- [规划助手接口定义](./planning-assistant/interfaces/planning-assistant.interface.ts)
- [行程助手接口定义](./trip-planner/interfaces/trip-planner.interface.ts)
- [旅程助手接口定义](./journey-assistant/interfaces/journey-assistant.interface.ts)

---

## ✅ 检查清单

### 规划助手 MCP 能力检查
- [ ] Exa MCP - Web搜索
- [ ] Google Maps Direct - 地点搜索
- [ ] Hotel Direct API - 酒店搜索
- [ ] Weather Direct API - 天气查询
- [ ] Vision Service + OCR - 图片识别地点、OCR提取文字
- [ ] Translation Direct API - 翻译服务、图片翻译
- [ ] Airbnb MCP - 民宿搜索（可选）
- [ ] Amadeus MCP - 航班搜索（可选）
- [ ] Rail MCP - 铁路查询（可选）
- [ ] Image Direct API - 图片搜索（可选）

### 行程助手 MCP 能力检查
- [ ] Google Maps Direct - 路线规划
- [ ] Restaurant Direct API - 餐厅搜索
- [ ] Hotel Direct API - 酒店搜索
- [ ] Weather Direct API - 天气查询
- [ ] Google Calendar MCP - 日历同步
- [ ] Stripe Direct API - 支付处理
- [ ] Vision Service + OCR - 图片识别地点、OCR提取文字
- [ ] Translation Direct API - 翻译服务、图片翻译
- [ ] Amadeus MCP - 航班查询（可选）
- [ ] Rail MCP - 铁路查询（可选）
- [ ] Image Direct API - 图片搜索（可选）
- [ ] Exa MCP - 信息查询（可选）

### 旅程助手 MCP 能力检查
- [ ] Google Maps Direct - 实时导航
- [ ] Restaurant Direct API - 附近餐厅
- [ ] Weather Direct API - 实时天气
- [ ] Google Calendar MCP - 日程管理
- [ ] Vision Service + OCR - 图片识别地点、OCR提取文字（核心）
- [ ] Translation Direct API - 图片翻译（菜单、路牌等）（核心）
- [ ] Stripe Direct API - 支付处理（可选）
- [ ] Exa MCP - 实时信息（可选）

---

## 📸 图片处理能力详细说明

### 图片搜索的多种使用场景

#### 1. 传统场景：获取目的地/景点图片

**场景**：用户想查看目的地的图片，了解景点外观

**实现**：
```typescript
// 搜索景点图片
const images = await mcpClient.callTool('image.search', {
  query: 'Iceland Blue Lagoon',
  perPage: 10,
});
```

**使用智能体**：规划助手、行程助手

---

#### 2. OCR + 翻译场景：用户上传图片，提取文字并翻译

**场景**：
- 用户拍菜单，需要翻译
- 用户拍路牌，需要翻译
- 用户拍景点介绍牌，需要翻译

**实现流程**：
```typescript
// 步骤 1: OCR 提取文字
const ocrResult = await visionService.poiRecommend(imageBuffer, {
  lat: currentLocation.lat,
  lng: currentLocation.lng,
});

// 步骤 2: 翻译文字
const translatedText = await mcpClient.callTool('translation.translate', {
  text: ocrResult.ocrResult.fullText,
  target: 'zh', // 用户语言
});
```

**使用智能体**：旅程助手（核心）、行程助手

**优先级**：⭐⭐⭐⭐⭐（旅程助手 P0 核心能力）

---

#### 3. 反向图片搜索场景：用户上传图片，找到相似的地点

**场景**：
- 用户拍了一张地标照片，想知道这是哪里
- 用户拍了一张建筑照片，想找到具体位置

**实现流程**：
```typescript
// 步骤 1: Vision Service 识别地标
const visionResult = await visionService.poiRecommend(imageBuffer, {
  lat: approximateLat,
  lng: approximateLng,
});

// 步骤 2: 从 OCR 结果中提取地点名称
const placeNames = extractPlaceNames(visionResult.ocrResult.lines);

// 步骤 3: Google Maps 搜索地点
const places = await Promise.all(
  placeNames.map(name =>
    mcpClient.callTool('google_maps.searchPlaces', {
      query: name,
      location: { lat: approximateLat, lng: approximateLng },
    })
  )
);
```

**使用智能体**：规划助手、旅程助手

**优先级**：⭐⭐⭐⭐（P1 增强能力）

---

#### 4. 图片识别地点场景：识别图片中的地标、建筑

**场景**：
- 用户拍了一张地标照片，想知道具体位置和相关信息
- 用户拍了一张餐厅外观，想找到这家餐厅

**实现流程**：
```typescript
// 步骤 1: Vision Service 识别图片内容
const visionResult = await visionService.poiRecommend(imageBuffer, {
  lat: currentLocation.lat,
  lng: currentLocation.lng,
});

// 步骤 2: 从候选 POI 中选择最匹配的
const matchedPoi = visionResult.candidates[0];

// 步骤 3: 获取地点详细信息
const placeDetails = await mcpClient.callTool('google_maps.searchPlaces', {
  query: matchedPoi.name,
  location: { lat: currentLocation.lat, lng: currentLocation.lng },
});
```

**使用智能体**：规划助手、行程助手、旅程助手

**优先级**：⭐⭐⭐⭐（P1 增强能力）

---

### Vision Service + OCR 能力配置

#### 规划助手配置

```typescript
{
  serviceName: 'vision',
  tools: ['vision.poiRecommend', 'ocr.extractText'],
  priority: 'P1',
  enabled: true,
  authRequired: false,
  useCases: [
    '用户上传地标照片，识别地点',
    '用户上传景点介绍牌，提取文字',
    '反向图片搜索，找到相似地点',
  ],
}
```

#### 行程助手配置

```typescript
{
  serviceName: 'vision',
  tools: ['vision.poiRecommend', 'ocr.extractText'],
  priority: 'P1',
  enabled: true,
  authRequired: false,
  useCases: [
    '用户上传餐厅外观，找到餐厅',
    '用户上传菜单，提取文字',
    '识别图片中的地标',
  ],
}
```

#### 旅程助手配置

```typescript
{
  serviceName: 'vision',
  tools: ['vision.poiRecommend', 'ocr.extractText'],
  priority: 'P0', // 旅程助手核心能力
  enabled: true,
  authRequired: false,
  useCases: [
    '用户上传菜单，OCR提取文字并翻译',
    '用户上传路牌，OCR提取文字并翻译',
    '用户上传景点介绍牌，OCR提取文字并翻译',
    '用户上传地标照片，识别地点',
  ],
}
```

### Translation + Vision 组合能力

#### 图片翻译流程

```typescript
// 完整的图片翻译流程
async function translateImage(imageBuffer: Buffer, targetLanguage: string) {
  // 1. OCR 提取文字
  const ocrResult = await visionService.poiRecommend(imageBuffer, {
    lat: 0, // 如果不知道位置，可以传 0
    lng: 0,
  });

  // 2. 检测源语言
  const sourceLanguage = await mcpClient.callTool('translation.detectLanguage', {
    text: ocrResult.ocrResult.fullText,
  });

  // 3. 翻译文字
  const translatedText = await mcpClient.callTool('translation.translate', {
    text: ocrResult.ocrResult.fullText,
    source: sourceLanguage.language,
    target: targetLanguage,
  });

  // 4. 返回结果
  return {
    originalText: ocrResult.ocrResult.fullText,
    translatedText: translatedText.text,
    sourceLanguage: sourceLanguage.language,
    targetLanguage: targetLanguage,
    lines: ocrResult.ocrResult.lines.map((line, index) => ({
      original: line,
      translated: translatedText.lines?.[index] || '',
    })),
  };
}
```

### 使用示例

#### 示例 1：翻译菜单

```typescript
// 用户上传菜单图片
const menuImage = await getUserUploadedImage();

// OCR + 翻译
const result = await translateImage(menuImage, 'zh');

// 返回翻译后的菜单
return {
  originalMenu: result.originalText,
  translatedMenu: result.translatedText,
  lineByLine: result.lines,
};
```

#### 示例 2：识别地标并搜索

```typescript
// 用户上传地标照片
const landmarkImage = await getUserUploadedImage();

// Vision Service 识别
const visionResult = await visionService.poiRecommend(landmarkImage, {
  lat: approximateLat,
  lng: approximateLng,
});

// 从候选 POI 中选择
const matchedPoi = visionResult.candidates[0];

// Google Maps 搜索详细信息
const placeDetails = await mcpClient.callTool('google_maps.searchPlaces', {
  query: matchedPoi.name,
  location: { lat: approximateLat, lng: approximateLng },
});

// 返回地点信息
return {
  identifiedPlace: matchedPoi.name,
  placeDetails: placeDetails,
  suggestions: visionResult.suggestions,
};
```

#### 示例 3：反向图片搜索

```typescript
// 用户上传图片，想知道这是哪里
const unknownImage = await getUserUploadedImage();

// Vision Service 识别
const visionResult = await visionService.poiRecommend(unknownImage, {
  lat: 0, // 未知位置
  lng: 0,
});

// 从 OCR 结果中提取可能的地点名称
const placeNames = extractPlaceNames(visionResult.ocrResult.lines);

// 搜索每个可能的地点
const searchResults = await Promise.all(
  placeNames.map(name =>
    mcpClient.callTool('google_maps.searchPlaces', {
      query: name,
    })
  )
);

// 返回搜索结果
return {
  possiblePlaces: searchResults,
  ocrText: visionResult.ocrResult.fullText,
};
```

---

## 💻 代码配置示例

### 1. 智能体 MCP 能力配置接口

```typescript
// src/agent/assistants/interfaces/agent-mcp-config.interface.ts

export interface AgentMcpCapability {
  serviceName: string;
  tools: string[];
  priority: 'P0' | 'P1' | 'P2';
  enabled: boolean;
  authRequired: boolean;
}

export interface AgentMcpConfig {
  agentType: 'planning' | 'trip-planner' | 'journey';
  capabilities: AgentMcpCapability[];
}

// 规划助手配置
export const PLANNING_ASSISTANT_MCP_CONFIG: AgentMcpConfig = {
  agentType: 'planning',
  capabilities: [
    {
      serviceName: 'exa',
      tools: ['web_search_exa', 'deep_search_exa'],
      priority: 'P0',
      enabled: true,
      authRequired: true,
    },
    {
      serviceName: 'google_maps',
      tools: ['google_maps.searchPlaces', 'google_maps.geocode'],
      priority: 'P0',
      enabled: true,
      authRequired: false,
    },
    {
      serviceName: 'hotel',
      tools: ['hotel.search', 'hotel.recommend'],
      priority: 'P0',
      enabled: true,
      authRequired: true,
    },
    {
      serviceName: 'weather',
      tools: ['weather.getCurrentWeather', 'weather.getWeatherByDatetimeRange'],
      priority: 'P0',
      enabled: true,
      authRequired: false,
    },
    // P1 能力...
  ],
};

// 行程助手配置
export const TRIP_PLANNER_MCP_CONFIG: AgentMcpConfig = {
  agentType: 'trip-planner',
  capabilities: [
    {
      serviceName: 'google_maps',
      tools: ['google_maps.getRoute', 'google_maps.computeDistanceMatrix', 'google_maps.searchPlaces'],
      priority: 'P0',
      enabled: true,
      authRequired: false,
    },
    {
      serviceName: 'restaurant',
      tools: ['restaurant.search', 'restaurant.recommend', 'restaurant.nearby'],
      priority: 'P0',
      enabled: true,
      authRequired: true,
    },
    {
      serviceName: 'hotel',
      tools: ['hotel.search', 'hotel.recommend'],
      priority: 'P0',
      enabled: true,
      authRequired: true,
    },
    {
      serviceName: 'weather',
      tools: ['weather.getCurrentWeather', 'weather.getWeatherByDatetimeRange'],
      priority: 'P0',
      enabled: true,
      authRequired: false,
    },
    {
      serviceName: 'google_calendar',
      tools: ['create_event', 'find_free_slots', 'quick_add'],
      priority: 'P0',
      enabled: true,
      authRequired: true,
    },
    {
      serviceName: 'stripe',
      tools: ['stripe.createPaymentIntent', 'stripe.confirmPayment'],
      priority: 'P0',
      enabled: true,
      authRequired: true,
    },
    // P1 能力...
  ],
};

// 旅程助手配置
export const JOURNEY_ASSISTANT_MCP_CONFIG: AgentMcpConfig = {
  agentType: 'journey',
  capabilities: [
    {
      serviceName: 'google_maps',
      tools: ['google_maps.getRoute', 'google_maps.computeDistanceMatrix', 'google_maps.searchPlaces'],
      priority: 'P0',
      enabled: true,
      authRequired: false,
    },
    {
      serviceName: 'restaurant',
      tools: ['restaurant.search', 'restaurant.nearby'],
      priority: 'P0',
      enabled: true,
      authRequired: true,
    },
    {
      serviceName: 'weather',
      tools: ['weather.getCurrentWeather'],
      priority: 'P0',
      enabled: true,
      authRequired: false,
    },
    {
      serviceName: 'google_calendar',
      tools: ['events_list', 'create_event', 'get_current_date_time'],
      priority: 'P0',
      enabled: true,
      authRequired: true,
    },
    // P1 能力...
  ],
};
```

### 2. MCP 能力管理器服务

```typescript
// src/agent/assistants/services/agent-mcp-manager.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { AgentMcpConfig, AgentMcpCapability } from '../interfaces/agent-mcp-config.interface';
import {
  PLANNING_ASSISTANT_MCP_CONFIG,
  TRIP_PLANNER_MCP_CONFIG,
  JOURNEY_ASSISTANT_MCP_CONFIG,
} from '../interfaces/agent-mcp-config.interface';

@Injectable()
export class AgentMcpManagerService {
  private readonly logger = new Logger(AgentMcpManagerService.name);
  
  private configs: Map<string, AgentMcpConfig> = new Map([
    ['planning', PLANNING_ASSISTANT_MCP_CONFIG],
    ['trip-planner', TRIP_PLANNER_MCP_CONFIG],
    ['journey', JOURNEY_ASSISTANT_MCP_CONFIG],
  ]);

  /**
   * 获取智能体的 MCP 能力配置
   */
  getAgentCapabilities(agentType: string): AgentMcpCapability[] {
    const config = this.configs.get(agentType);
    if (!config) {
      this.logger.warn(`Unknown agent type: ${agentType}`);
      return [];
    }
    return config.capabilities.filter(cap => cap.enabled);
  }

  /**
   * 获取 P0 核心能力
   */
  getCoreCapabilities(agentType: string): AgentMcpCapability[] {
    return this.getAgentCapabilities(agentType).filter(cap => cap.priority === 'P0');
  }

  /**
   * 检查能力是否可用
   */
  isCapabilityAvailable(agentType: string, serviceName: string): boolean {
    const capabilities = this.getAgentCapabilities(agentType);
    return capabilities.some(cap => cap.serviceName === serviceName && cap.enabled);
  }

  /**
   * 获取工具列表
   */
  getAvailableTools(agentType: string): string[] {
    const capabilities = this.getAgentCapabilities(agentType);
    return capabilities.flatMap(cap => cap.tools);
  }
}
```

### 3. 在智能体服务中使用 MCP 能力

```typescript
// src/agent/assistants/planning-assistant/services/planning-assistant.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { AgentMcpManagerService } from '../../services/agent-mcp-manager.service';
import { McpClientService } from '../../../mcp/services/mcp-client.service';

@Injectable()
export class PlanningAssistantService {
  private readonly logger = new Logger(PlanningAssistantService.name);
  
  constructor(
    private readonly mcpManager: AgentMcpManagerService,
    private readonly mcpClient: McpClientService,
  ) {}

  /**
   * 搜索目的地信息
   */
  async searchDestination(query: string) {
    // 检查 Exa MCP 是否可用
    if (!this.mcpManager.isCapabilityAvailable('planning', 'exa')) {
      throw new Error('Exa MCP capability not available');
    }

    // 调用 Exa Web 搜索
    const result = await this.mcpClient.callTool('web_search_exa', {
      query,
      numResults: 10,
    });

    return result;
  }

  /**
   * 搜索酒店
   */
  async searchHotels(location: { lat: number; lng: number }, checkIn: string, checkOut: string) {
    // 检查 Hotel Direct API 是否可用
    if (!this.mcpManager.isCapabilityAvailable('planning', 'hotel')) {
      throw new Error('Hotel Direct API capability not available');
    }

    // 调用 Hotel 搜索
    const result = await this.mcpClient.callTool('hotel.search', {
      location,
      checkIn,
      checkOut,
      minRating: 4.0,
    });

    return result;
  }

  /**
   * 查询天气
   */
  async getWeather(city: string, startDate?: string, endDate?: string) {
    // 检查 Weather Direct API 是否可用
    if (!this.mcpManager.isCapabilityAvailable('planning', 'weather')) {
      throw new Error('Weather Direct API capability not available');
    }

    if (startDate && endDate) {
      // 查询日期范围内的天气
      return await this.mcpClient.callTool('weather.getWeatherByDatetimeRange', {
        city,
        startDate,
        endDate,
      });
    } else {
      // 查询当前天气
      return await this.mcpClient.callTool('weather.getCurrentWeather', {
        city,
      });
    }
  }
}
```

---

## 🚀 实施步骤

### 步骤 1: 创建配置接口和常量

1. 创建 `src/agent/assistants/interfaces/agent-mcp-config.interface.ts`
2. 定义 `AgentMcpCapability` 和 `AgentMcpConfig` 接口
3. 定义三个智能体的配置常量

### 步骤 2: 创建 MCP 能力管理器服务

1. 创建 `src/agent/assistants/services/agent-mcp-manager.service.ts`
2. 实现能力查询、工具列表等功能
3. 在 `AssistantsModule` 中注册服务

### 步骤 3: 在智能体服务中集成

1. 在 `PlanningAssistantService` 中注入 `AgentMcpManagerService`
2. 在 `TripPlannerService` 中注入 `AgentMcpManagerService`
3. 在 `JourneyAssistantService` 中注入 `AgentMcpManagerService`
4. 实现使用 MCP 能力的方法

### 步骤 4: 创建 MCP 客户端服务

```typescript
// src/mcp/services/mcp-client.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { GoogleMapsDirectService } from '../google-maps-direct.service';
import { WeatherDirectService } from '../weather-direct.service';
import { RestaurantDirectService } from '../restaurant-direct.service';
import { HotelDirectService } from '../hotel-direct.service';
// ... 其他服务

@Injectable()
export class McpClientService {
  private readonly logger = new Logger(McpClientService.name);

  constructor(
    private readonly googleMapsService: GoogleMapsDirectService,
    private readonly weatherService: WeatherDirectService,
    private readonly restaurantService: RestaurantDirectService,
    private readonly hotelService: HotelDirectService,
    // ... 其他服务
  ) {}

  /**
   * 统一调用 MCP 工具
   */
  async callTool(toolName: string, args: any): Promise<any> {
    try {
      // 根据工具名称路由到对应的服务
      if (toolName.startsWith('google_maps.')) {
        return await this.callGoogleMapsTool(toolName, args);
      } else if (toolName.startsWith('weather.')) {
        return await this.callWeatherTool(toolName, args);
      } else if (toolName.startsWith('restaurant.')) {
        return await this.callRestaurantTool(toolName, args);
      } else if (toolName.startsWith('hotel.')) {
        return await this.callHotelTool(toolName, args);
      }
      // ... 其他工具路由

      throw new Error(`Unknown tool: ${toolName}`);
    } catch (error: any) {
      this.logger.error(`Error calling tool ${toolName}:`, error);
      throw error;
    }
  }

  private async callGoogleMapsTool(toolName: string, args: any) {
    switch (toolName) {
      case 'google_maps.searchPlaces':
        return await this.googleMapsService.searchPlaces(args.query, args.location);
      case 'google_maps.getRoute':
        return await this.googleMapsService.getRoute(args.origin, args.destination);
      case 'google_maps.geocode':
        return await this.googleMapsService.geocode(args.address);
      default:
        throw new Error(`Unknown Google Maps tool: ${toolName}`);
    }
  }

  private async callWeatherTool(toolName: string, args: any) {
    switch (toolName) {
      case 'weather.getCurrentWeather':
        return await this.weatherService.getCurrentWeather(args.city);
      case 'weather.getWeatherByDatetimeRange':
        return await this.weatherService.getWeatherByDatetimeRange(
          args.city,
          args.startDate,
          args.endDate,
        );
      default:
        throw new Error(`Unknown Weather tool: ${toolName}`);
    }
  }

  // ... 其他工具路由方法
}
```

### 步骤 5: 环境变量配置

```bash
# .env

# Google Maps
GOOGLE_MAPS_API_KEY=your_api_key_here

# Exa
EXA_API_KEY=your_api_key_here

# Stripe
STRIPE_SECRET_KEY=your_secret_key_here

# Amadeus
AMADEUS_API_KEY=your_api_key_here
AMADEUS_API_SECRET=your_api_secret_here

# Weather (无需配置，使用 Open-Meteo API)
# ...

# PostgreSQL MCP
POSTGRESQL_MCP_CONNECTION_STRING=postgresql://user:password@localhost:5432/dbname
```

### 步骤 6: 测试配置

```typescript
// scripts/test-agent-mcp-capabilities.ts

import { AgentMcpManagerService } from '../src/agent/assistants/services/agent-mcp-manager.service';

async function testCapabilities() {
  const manager = new AgentMcpManagerService();

  // 测试规划助手能力
  console.log('规划助手能力:');
  const planningCaps = manager.getAgentCapabilities('planning');
  console.log(planningCaps.map(cap => `${cap.serviceName} (${cap.priority})`));

  // 测试行程助手能力
  console.log('\n行程助手能力:');
  const tripPlannerCaps = manager.getAgentCapabilities('trip-planner');
  console.log(tripPlannerCaps.map(cap => `${cap.serviceName} (${cap.priority})`));

  // 测试旅程助手能力
  console.log('\n旅程助手能力:');
  const journeyCaps = manager.getAgentCapabilities('journey');
  console.log(journeyCaps.map(cap => `${cap.serviceName} (${cap.priority})`));
}

testCapabilities();
```

---

## 📖 使用示例

### 规划助手使用示例

```typescript
// 示例：规划助手搜索目的地并推荐酒店

async function planningAssistantExample() {
  const planningAssistant = new PlanningAssistantService(
    mcpManager,
    mcpClient,
  );

  // 1. 用户说"我想去冰岛"
  const destinationInfo = await planningAssistant.searchDestination('冰岛旅游攻略');
  console.log('目的地信息:', destinationInfo);

  // 2. 搜索冰岛主要城市
  const cities = await mcpClient.callTool('google_maps.searchPlaces', {
    query: '冰岛 雷克雅未克',
    location: { lat: 64.1466, lng: -21.9426 },
  });

  // 3. 查询天气
  const weather = await planningAssistant.getWeather('Reykjavik', '2026-07-01', '2026-07-07');
  console.log('天气信息:', weather);

  // 4. 搜索酒店
  const hotels = await planningAssistant.searchHotels(
    { lat: 64.1466, lng: -21.9426 },
    '2026-07-01',
    '2026-07-07',
  );
  console.log('酒店推荐:', hotels);
}
```

### 行程助手使用示例

```typescript
// 示例：行程助手安排餐厅并同步日历

async function tripPlannerExample() {
  const tripPlanner = new TripPlannerService(mcpManager, mcpClient);

  // 1. 用户说"帮我安排今天的餐厅"
  const currentLocation = { lat: 40.7128, lng: -74.0060 }; // 纽约

  // 2. 搜索附近餐厅
  const restaurants = await mcpClient.callTool('restaurant.search', {
    location: currentLocation,
    radius: 1000,
    minRating: 4.0,
  });

  // 3. 查询天气（影响推荐）
  const weather = await mcpClient.callTool('weather.getCurrentWeather', {
    city: 'New York',
  });

  // 4. 根据天气推荐（如果下雨，推荐室内餐厅）
  const recommendedRestaurant = weather.condition === 'rain'
    ? restaurants.find(r => r.hasIndoorSeating)
    : restaurants[0];

  // 5. 用户确认预订
  const paymentIntent = await mcpClient.callTool('stripe.createPaymentIntent', {
    amount: 5000, // $50.00
    currency: 'usd',
    metadata: {
      restaurantId: recommendedRestaurant.id,
      reservationDate: '2026-02-08T19:00:00Z',
    },
  });

  // 6. 同步到日历
  await mcpClient.callTool('create_event', {
    summary: `晚餐: ${recommendedRestaurant.name}`,
    start: {
      dateTime: '2026-02-08T19:00:00Z',
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: '2026-02-08T21:00:00Z',
      timeZone: 'America/New_York',
    },
    location: recommendedRestaurant.address,
  });

  console.log('餐厅预订完成！');
}
```

### 旅程助手使用示例

```typescript
// 示例：旅程助手实时导航和附近搜索

async function journeyAssistantExample() {
  const journeyAssistant = new JourneyAssistantService(mcpManager, mcpClient);

  // 1. 用户说"附近有什么好吃的？"
  const currentLocation = { lat: 40.7128, lng: -74.0060 };

  // 2. 搜索附近餐厅
  const nearbyRestaurants = await mcpClient.callTool('restaurant.nearby', {
    location: currentLocation,
    radius: 500,
  });

  // 3. 用户选择餐厅并请求导航
  const selectedRestaurant = nearbyRestaurants[0];

  // 4. 计算路线
  const route = await mcpClient.callTool('google_maps.getRoute', {
    origin: currentLocation,
    destination: {
      lat: selectedRestaurant.location.lat,
      lng: selectedRestaurant.location.lng,
    },
    mode: 'walking',
  });

  // 5. 查询实时天气
  const weather = await mcpClient.callTool('weather.getCurrentWeather', {
    city: 'New York',
  });

  // 6. 如果下雨，提醒用户带伞
  if (weather.condition === 'rain') {
    console.log('⚠️ 当前正在下雨，建议带伞！');
  }

  console.log(`导航到 ${selectedRestaurant.name}:`);
  console.log(`距离: ${route.distance.text}`);
  console.log(`时间: ${route.duration.text}`);
  console.log(`路线: ${route.steps.map(s => s.instructions).join(' -> ')}`);
}
```

---

## ⚠️ 错误处理指南

### 1. 能力不可用错误

```typescript
try {
  await mcpClient.callTool('exa.web_search_exa', { query: 'test' });
} catch (error) {
  if (error.message.includes('not available')) {
    // 降级处理：使用备用服务或返回错误信息
    console.log('Exa MCP 不可用，使用备用搜索服务');
    return await fallbackSearchService.search(query);
  }
  throw error;
}
```

### 2. 认证错误

```typescript
try {
  await mcpClient.callTool('stripe.createPaymentIntent', { amount: 1000 });
} catch (error) {
  if (error.statusCode === 401) {
    // 需要用户授权
    throw new Error('请先授权 Stripe 支付服务');
  }
  throw error;
}
```

### 3. 限流错误

```typescript
async function callWithRetry(toolName: string, args: any, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await mcpClient.callTool(toolName, args);
    } catch (error) {
      if (error.statusCode === 429 && i < maxRetries - 1) {
        // 限流，等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
}
```

### 4. 超时错误

```typescript
async function callWithTimeout(toolName: string, args: any, timeout = 5000) {
  return Promise.race([
    mcpClient.callTool(toolName, args),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    ),
  ]);
}
```

---

## 🔍 调试和监控

### 1. 启用调试日志

```typescript
// 在服务中启用详细日志
this.logger.debug(`Calling MCP tool: ${toolName}`, { args });
const result = await mcpClient.callTool(toolName, args);
this.logger.debug(`MCP tool result: ${toolName}`, { result });
```

### 2. 监控 MCP 调用

```typescript
// 添加监控中间件
@Injectable()
export class McpMonitoringService {
  private callCounts: Map<string, number> = new Map();
  private callErrors: Map<string, number> = new Map();

  recordCall(toolName: string, success: boolean) {
    this.callCounts.set(toolName, (this.callCounts.get(toolName) || 0) + 1);
    if (!success) {
      this.callErrors.set(toolName, (this.callErrors.get(toolName) || 0) + 1);
    }
  }

  getStats() {
    return {
      callCounts: Object.fromEntries(this.callCounts),
      errorRates: Object.fromEntries(
        Array.from(this.callCounts.entries()).map(([tool, count]) => [
          tool,
          (this.callErrors.get(tool) || 0) / count,
        ])
      ),
    };
  }
}
```

---

## 📊 性能评估与监控

### 1. 性能指标定义

#### 核心性能指标

| 指标 | 定义 | 目标值 | 监控方式 |
|------|------|--------|---------|
| **延迟（P50）** | 50% 请求的响应时间 | < 500ms | 实时监控 |
| **延迟（P95）** | 95% 请求的响应时间 | < 2s | 实时监控 |
| **延迟（P99）** | 99% 请求的响应时间 | < 5s | 实时监控 |
| **吞吐量（QPS）** | 每秒处理的请求数 | > 100 | 实时监控 |
| **错误率** | 失败请求占比 | < 1% | 实时监控 |
| **可用性** | 服务可用时间占比 | > 99.9% | 实时监控 |

#### 各 MCP 服务性能基准

**Google Maps Direct API**:
- 延迟 P50: 200-400ms
- 延迟 P95: 800-1200ms
- 延迟 P99: 2000-3000ms
- 吞吐量: 1000+ QPS（受 API 配额限制）

**Weather Direct API**:
- 延迟 P50: 100-200ms
- 延迟 P95: 300-500ms
- 延迟 P99: 800-1000ms
- 吞吐量: 500+ QPS（免费，无配额限制）

**Restaurant Direct API**:
- 延迟 P50: 300-500ms
- 延迟 P95: 1000-1500ms
- 延迟 P99: 2500-3500ms
- 吞吐量: 200+ QPS（受 API 配额限制）

**Hotel Direct API**:
- 延迟 P50: 400-600ms
- 延迟 P95: 1500-2000ms
- 延迟 P99: 3000-4000ms
- 吞吐量: 100+ QPS（受 API 配额限制）

**Exa MCP**:
- 延迟 P50: 500-800ms
- 延迟 P95: 2000-3000ms
- 延迟 P99: 5000-8000ms
- 吞吐量: 50+ QPS（受 API 配额限制）

**Google Calendar MCP**:
- 延迟 P50: 300-500ms
- 延迟 P95: 1000-1500ms
- 延迟 P99: 2500-3500ms
- 吞吐量: 100+ QPS（受 OAuth 配额限制）

**Stripe Direct API**:
- 延迟 P50: 200-400ms
- 延迟 P95: 800-1200ms
- 延迟 P99: 2000-3000ms
- 吞吐量: 500+ QPS（受 API 配额限制）

### 2. 性能监控服务实现

```typescript
// src/agent/assistants/services/mcp-performance-monitor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface McpPerformanceMetrics {
  serviceName: string;
  toolName: string;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    count: number;
  };
  throughput: {
    qps: number;
    totalRequests: number;
    timeWindow: number;
  };
  errorRate: {
    totalErrors: number;
    totalRequests: number;
    rate: number;
  };
  availability: {
    uptime: number;
    downtime: number;
    rate: number;
  };
}

@Injectable()
export class McpPerformanceMonitorService {
  private readonly logger = new Logger(McpPerformanceMonitorService.name);
  private readonly metricsKeyPrefix = 'mcp:performance:';
  
  // 性能数据缓存（最近 1000 次调用）
  private performanceData: Map<string, number[]> = new Map();
  private errorData: Map<string, number> = new Map();
  private requestData: Map<string, number> = new Map();

  constructor(
    @Optional() private readonly redisService?: RedisService,
  ) {}

  /**
   * 记录 MCP 调用性能
   */
  async recordCall(
    serviceName: string,
    toolName: string,
    latency: number,
    success: boolean,
  ): Promise<void> {
    const key = `${serviceName}:${toolName}`;
    
    // 记录延迟数据
    if (!this.performanceData.has(key)) {
      this.performanceData.set(key, []);
    }
    const latencies = this.performanceData.get(key)!;
    latencies.push(latency);
    
    // 只保留最近 1000 次调用
    if (latencies.length > 1000) {
      latencies.shift();
    }

    // 记录错误数据
    if (!success) {
      this.errorData.set(key, (this.errorData.get(key) || 0) + 1);
    }

    // 记录请求数据
    this.requestData.set(key, (this.requestData.get(key) || 0) + 1);

    // 同步到 Redis（如果可用）
    if (this.redisService) {
      await this.redisService.set(
        `${this.metricsKeyPrefix}${key}:latest`,
        JSON.stringify({ latency, success, timestamp: Date.now() }),
        3600, // 1 小时过期
      );
    }
  }

  /**
   * 获取性能指标
   */
  async getPerformanceMetrics(
    serviceName: string,
    toolName: string,
  ): Promise<McpPerformanceMetrics> {
    const key = `${serviceName}:${toolName}`;
    const latencies = this.performanceData.get(key) || [];
    const errors = this.errorData.get(key) || 0;
    const requests = this.requestData.get(key) || 0;

    // 计算延迟分位数
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const p50 = this.getPercentile(sortedLatencies, 50);
    const p95 = this.getPercentile(sortedLatencies, 95);
    const p99 = this.getPercentile(sortedLatencies, 99);
    const avg = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    return {
      serviceName,
      toolName,
      latency: {
        p50,
        p95,
        p99,
        avg,
        count: latencies.length,
      },
      throughput: {
        qps: requests / 60, // 假设是最近 1 分钟的数据
        totalRequests: requests,
        timeWindow: 60,
      },
      errorRate: {
        totalErrors: errors,
        totalRequests: requests,
        rate: requests > 0 ? errors / requests : 0,
      },
      availability: {
        uptime: requests - errors,
        downtime: errors,
        rate: requests > 0 ? (requests - errors) / requests : 1,
      },
    };
  }

  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)] || 0;
  }
}
```

### 3. 性能优化策略

#### 缓存策略

```typescript
// 缓存配置
const CACHE_CONFIG = {
  weather: {
    ttl: 3600, // 1 小时（天气变化较慢）
    keyPrefix: 'mcp:cache:weather:',
  },
  currency: {
    ttl: 300, // 5 分钟（汇率变化较快）
    keyPrefix: 'mcp:cache:currency:',
  },
  places: {
    ttl: 86400, // 24 小时（地点信息变化较慢）
    keyPrefix: 'mcp:cache:places:',
  },
  restaurants: {
    ttl: 3600, // 1 小时（餐厅信息变化较慢）
    keyPrefix: 'mcp:cache:restaurants:',
  },
  hotels: {
    ttl: 3600, // 1 小时（酒店信息变化较慢）
    keyPrefix: 'mcp:cache:hotels:',
  },
};
```

#### 批量调用优化

```typescript
// 批量调用示例
async function batchSearchRestaurants(locations: Array<{ lat: number; lng: number }>) {
  // 并行调用多个位置
  const promises = locations.map(location =>
    mcpClient.callTool('restaurant.search', { location })
  );
  return Promise.all(promises);
}
```

#### 异步调用优化

```typescript
// 非关键路径使用异步调用
async function enhanceWithImages(restaurants: Restaurant[]) {
  // 图片搜索不阻塞主流程
  const imagePromises = restaurants.map(restaurant =>
    mcpClient.callTool('image.search', { query: restaurant.name })
      .catch(err => {
        // 图片加载失败不影响主流程
        this.logger.warn(`Failed to load image for ${restaurant.name}:`, err);
        return null;
      })
  );
  
  // 主流程继续执行
  const images = await Promise.all(imagePromises);
  
  // 合并结果
  return restaurants.map((restaurant, index) => ({
    ...restaurant,
    image: images[index],
  }));
}
```

---

## 💰 成本分析与优化

### 1. MCP 服务成本估算

#### 各服务调用成本（基于公开定价，实际可能不同）

| MCP 服务 | 调用成本 | 月调用量估算 | 月成本估算 | 备注 |
|---------|---------|------------|----------|------|
| **Google Maps Direct** | $0.005/次 | 100,000 | $500 | 受 API 配额限制 |
| **Weather Direct API** | 免费 | 无限制 | $0 | 使用 Open-Meteo API |
| **Restaurant Direct API** | $0.01/次 | 50,000 | $500 | 受 API 配额限制 |
| **Hotel Direct API** | $0.02/次 | 30,000 | $600 | 受 API 配额限制 |
| **Exa MCP** | $0.001/次 | 20,000 | $20 | 受 API 配额限制 |
| **Google Calendar MCP** | 免费 | 无限制 | $0 | OAuth 配额限制 |
| **Stripe Direct API** | 2.9% + $0.30 | 按交易量 | 按交易量 | 按交易收费 |
| **Airbnb MCP** | 免费 | 无限制 | $0 | 公开数据 |
| **Amadeus MCP** | $0.01/次 | 10,000 | $100 | 受 API 配额限制 |
| **Rail MCP** | 免费 | 无限制 | $0 | OAuth 配额限制 |
| **Image Direct API** | $0.001/次 | 10,000 | $10 | 受 API 配额限制 |
| **Translation Direct API** | $0.0001/字符 | 1M 字符 | $100 | 受 API 配额限制 |
| **Currency Direct API** | $0.0001/次 | 50,000 | $5 | 受 API 配额限制 |

**总成本估算**（月）：
- **P0 核心能力**: ~$1,720/月
- **P1 增强能力**: ~$135/月
- **P2 可选能力**: ~$115/月
- **总计**: ~$1,970/月（不含 Stripe 交易费用）

### 2. 成本监控服务实现

```typescript
// src/agent/assistants/services/mcp-cost-monitor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface McpCostMetrics {
  serviceName: string;
  toolName: string;
  totalCalls: number;
  totalCost: number;
  avgCostPerCall: number;
  costByDay: Record<string, number>;
  costTrend: 'INCREASING' | 'STABLE' | 'DECREASING';
}

@Injectable()
export class McpCostMonitorService {
  private readonly logger = new Logger(McpCostMonitorService.name);
  private readonly costKeyPrefix = 'mcp:cost:';
  
  // 各服务定价（基于公开信息）
  private readonly pricing = {
    'google_maps': {
      'searchPlaces': 0.005,
      'getRoute': 0.005,
      'geocode': 0.005,
      'computeDistanceMatrix': 0.005,
    },
    'restaurant': {
      'search': 0.01,
      'recommend': 0.01,
      'nearby': 0.01,
    },
    'hotel': {
      'search': 0.02,
      'recommend': 0.02,
    },
    'exa': {
      'web_search_exa': 0.001,
      'deep_search_exa': 0.002,
    },
    'amadeus': {
      'searchFlights': 0.01,
    },
    'image': {
      'search': 0.001,
      'recommend': 0.001,
    },
    'translation': {
      'translate': 0.0001, // 每字符
    },
    'currency': {
      'convert': 0.0001,
      'getRates': 0.0001,
    },
  };

  constructor(
    @Optional() private readonly redisService?: RedisService,
  ) {}

  /**
   * 记录 MCP 调用成本
   */
  async recordCost(
    serviceName: string,
    toolName: string,
    cost: number,
    metadata?: any,
  ): Promise<void> {
    const key = `${serviceName}:${toolName}`;
    const today = new Date().toISOString().split('T')[0];
    
    // 记录到 Redis
    if (this.redisService) {
      const dailyKey = `${this.costKeyPrefix}daily:${today}:${key}`;
      await this.redisService.incrby(dailyKey, cost);
      await this.redisService.expire(dailyKey, 86400 * 7); // 7 天过期
    }

    // 记录总成本
    const totalKey = `${this.costKeyPrefix}total:${key}`;
    if (this.redisService) {
      await this.redisService.incrby(totalKey, cost);
    }

    this.logger.debug(`Recorded cost for ${key}: $${cost}`);
  }

  /**
   * 计算调用成本（基于定价表）
   */
  calculateCost(serviceName: string, toolName: string, args: any): number {
    const servicePricing = this.pricing[serviceName];
    if (!servicePricing) {
      return 0; // 免费服务
    }

    const toolPricing = servicePricing[toolName];
    if (!toolPricing) {
      return 0; // 免费工具
    }

    // 特殊处理：翻译服务按字符数计费
    if (serviceName === 'translation' && toolName === 'translate') {
      const textLength = args.text?.length || 0;
      return toolPricing * textLength;
    }

    return toolPricing;
  }

  /**
   * 获取成本指标
   */
  async getCostMetrics(
    serviceName: string,
    toolName: string,
    days: number = 7,
  ): Promise<McpCostMetrics> {
    const key = `${serviceName}:${toolName}`;
    const costByDay: Record<string, number> = {};
    let totalCost = 0;

    // 获取最近 N 天的成本数据
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      if (this.redisService) {
        const dailyKey = `${this.costKeyPrefix}daily:${dateStr}:${key}`;
        const dailyCost = await this.redisService.get<number>(dailyKey) || 0;
        costByDay[dateStr] = dailyCost;
        totalCost += dailyCost;
      }
    }

    // 获取总调用次数
    const totalCalls = await this.getTotalCalls(serviceName, toolName);
    const avgCostPerCall = totalCalls > 0 ? totalCost / totalCalls : 0;

    // 计算成本趋势
    const costTrend = this.calculateCostTrend(costByDay);

    return {
      serviceName,
      toolName,
      totalCalls,
      totalCost,
      avgCostPerCall,
      costByDay,
      costTrend,
    };
  }

  private async getTotalCalls(serviceName: string, toolName: string): Promise<number> {
    // 从性能监控服务获取总调用次数
    // 这里简化处理，实际应该从性能监控服务获取
    return 0;
  }

  private calculateCostTrend(costByDay: Record<string, number>): 'INCREASING' | 'STABLE' | 'DECREASING' {
    const days = Object.keys(costByDay).sort();
    if (days.length < 2) return 'STABLE';

    const recent = days.slice(-3).reduce((sum, day) => sum + (costByDay[day] || 0), 0) / 3;
    const earlier = days.slice(0, 3).reduce((sum, day) => sum + (costByDay[day] || 0), 0) / 3;

    if (recent > earlier * 1.1) return 'INCREASING';
    if (recent < earlier * 0.9) return 'DECREASING';
    return 'STABLE';
  }

  /**
   * 检查成本告警
   */
  async checkCostAlerts(serviceName: string, toolName: string): Promise<string[]> {
    const metrics = await this.getCostMetrics(serviceName, toolName, 7);
    const alerts: string[] = [];

    // 日成本告警（超过 $100）
    const todayCost = metrics.costByDay[new Date().toISOString().split('T')[0]] || 0;
    if (todayCost > 100) {
      alerts.push(`Daily cost alert: ${serviceName}:${toolName} exceeded $100 today`);
    }

    // 周成本告警（超过 $500）
    if (metrics.totalCost > 500) {
      alerts.push(`Weekly cost alert: ${serviceName}:${toolName} exceeded $500 this week`);
    }

    // 成本趋势告警（快速增长）
    if (metrics.costTrend === 'INCREASING') {
      alerts.push(`Cost trend alert: ${serviceName}:${toolName} cost is increasing`);
    }

    return alerts;
  }
}
```

### 3. 成本优化策略

#### 调用频率控制

```typescript
// 为每个服务设置调用频率限制
const RATE_LIMITS = {
  'google_maps': {
    perMinute: 100,
    perHour: 1000,
    perDay: 10000,
  },
  'restaurant': {
    perMinute: 50,
    perHour: 500,
    perDay: 5000,
  },
  'hotel': {
    perMinute: 30,
    perHour: 300,
    perDay: 3000,
  },
  'exa': {
    perMinute: 20,
    perHour: 200,
    perDay: 2000,
  },
};
```

#### 降级策略

```typescript
// 当成本超预算时，降级到免费或更便宜的服务
async function searchWithFallback(query: string) {
  try {
    // 优先使用 Exa（较便宜）
    return await mcpClient.callTool('exa.web_search_exa', { query });
  } catch (error) {
    // 降级到 Google Maps（如果可用）
    return await mcpClient.callTool('google_maps.searchPlaces', { query });
  }
}
```

---

## 🎯 成功指标定义

### 1. 阶段一成功指标（P0 核心能力）

#### 技术指标

| 指标 | 目标值 | 验收标准 |
|------|--------|---------|
| **能力集成完成率** | 100% | 所有 P0 能力已集成并可用 |
| **性能达标率** | > 95% | P95 延迟 < 2s，错误率 < 1% |
| **成本控制** | < $2,000/月 | 总成本在预算内 |
| **可用性** | > 99.9% | 服务可用时间占比 |

#### 业务指标

| 指标 | 目标值 | 验收标准 |
|------|--------|---------|
| **能力使用率** | > 60% | 至少 60% 的用户会话使用了 MCP 能力 |
| **用户满意度** | > 4.0/5.0 | 用户评分 > 4.0 |
| **行程创建率提升** | +20% | 相比基线提升 20% |
| **用户留存率提升** | +15% | 相比基线提升 15% |

### 2. 阶段二成功指标（P1 增强能力）

#### 技术指标

| 指标 | 目标值 | 验收标准 |
|------|--------|---------|
| **能力集成完成率** | 100% | 所有 P1 能力已集成并可用 |
| **性能达标率** | > 90% | P95 延迟 < 3s，错误率 < 2% |
| **成本控制** | < $2,200/月 | 总成本在预算内 |

#### 业务指标

| 指标 | 目标值 | 验收标准 |
|------|--------|---------|
| **能力使用率** | > 50% | 至少 50% 的用户会话使用了 P1 能力 |
| **用户满意度** | > 4.2/5.0 | 用户评分 > 4.2 |
| **预订转化率提升** | +25% | 相比基线提升 25% |

### 3. 阶段三成功指标（P2 可选能力）

#### 技术指标

| 指标 | 目标值 | 验收标准 |
|------|--------|---------|
| **能力按需添加** | 100% | 根据用户反馈添加 P2 能力 |
| **性能达标率** | > 85% | P95 延迟 < 5s，错误率 < 3% |

#### 业务指标

| 指标 | 目标值 | 验收标准 |
|------|--------|---------|
| **用户反馈收集率** | > 30% | 至少 30% 的用户提供了反馈 |
| **能力价值验证** | 通过 | 通过 A/B 测试验证能力价值 |

### 4. 指标监控和告警

```typescript
// src/agent/assistants/services/mcp-metrics-alert.service.ts

@Injectable()
export class McpMetricsAlertService {
  /**
   * 检查所有指标并发送告警
   */
  async checkAllMetrics(): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // 检查性能指标
    const performanceAlerts = await this.checkPerformanceMetrics();
    alerts.push(...performanceAlerts);

    // 检查成本指标
    const costAlerts = await this.checkCostMetrics();
    alerts.push(...costAlerts);

    // 检查业务指标
    const businessAlerts = await this.checkBusinessMetrics();
    alerts.push(...businessAlerts);

    return alerts;
  }

  private async checkPerformanceMetrics(): Promise<Alert[]> {
    const alerts: Alert[] = [];
    
    // 检查延迟
    const latency = await this.performanceMonitor.getLatency('google_maps', 'searchPlaces');
    if (latency.p95 > 2000) {
      alerts.push({
        level: 'WARNING',
        message: `Google Maps P95 latency exceeded 2s: ${latency.p95}ms`,
        service: 'google_maps',
        metric: 'latency',
      });
    }

    // 检查错误率
    const errorRate = await this.performanceMonitor.getErrorRate('google_maps', 'searchPlaces');
    if (errorRate > 0.01) {
      alerts.push({
        level: 'ERROR',
        message: `Google Maps error rate exceeded 1%: ${errorRate * 100}%`,
        service: 'google_maps',
        metric: 'error_rate',
      });
    }

    return alerts;
  }

  private async checkCostMetrics(): Promise<Alert[]> {
    const alerts: Alert[] = [];
    
    // 检查日成本
    const dailyCost = await this.costMonitor.getDailyCost();
    if (dailyCost > 100) {
      alerts.push({
        level: 'WARNING',
        message: `Daily cost exceeded $100: $${dailyCost}`,
        service: 'all',
        metric: 'cost',
      });
    }

    return alerts;
  }

  private async checkBusinessMetrics(): Promise<Alert[]> {
    const alerts: Alert[] = [];
    
    // 检查能力使用率
    const usageRate = await this.businessMonitor.getCapabilityUsageRate();
    if (usageRate < 0.6) {
      alerts.push({
        level: 'INFO',
        message: `Capability usage rate below target: ${usageRate * 100}%`,
        service: 'all',
        metric: 'usage_rate',
      });
    }

    return alerts;
  }
}
```

---

## ⚠️ 风险应对计划

### 1. 风险识别

| 风险 | 概率 | 影响 | 风险等级 |
|------|------|------|---------|
| **MCP 服务不可用** | 中 | 高 | 🔴 高 |
| **成本超预算** | 中 | 中 | 🟡 中 |
| **性能不达标** | 低 | 中 | 🟡 中 |
| **用户不接受** | 低 | 高 | 🟡 中 |
| **认证失败** | 中 | 中 | 🟡 中 |
| **数据质量问题** | 低 | 低 | 🟢 低 |

### 2. 风险应对策略

#### MCP 服务不可用

**应对策略**：
1. **降级策略**：使用备用服务或缓存结果
2. **重试机制**：自动重试（最多 3 次，指数退避）
3. **监控告警**：实时监控服务可用性，及时告警
4. **用户提示**：友好的错误提示，引导用户稍后重试

**实施代码**：
```typescript
async function callWithFallback(toolName: string, args: any) {
  try {
    return await mcpClient.callTool(toolName, args);
  } catch (error) {
    // 降级到备用服务
    const fallbackTool = getFallbackTool(toolName);
    if (fallbackTool) {
      return await mcpClient.callTool(fallbackTool, args);
    }
    
    // 使用缓存结果
    const cached = await cacheService.get(toolName, args);
    if (cached) {
      return cached;
    }
    
    throw error;
  }
}
```

#### 成本超预算

**应对策略**：
1. **成本监控**：实时监控成本，设置告警阈值
2. **调用频率控制**：限制每个服务的调用频率
3. **降级策略**：成本超预算时，降级到免费或更便宜的服务
4. **成本优化**：使用缓存、批量调用、异步调用

**实施代码**：
```typescript
async function callWithCostControl(toolName: string, args: any) {
  // 检查成本预算
  const dailyCost = await costMonitor.getDailyCost();
  if (dailyCost > DAILY_BUDGET) {
    // 降级到免费服务
    return await callFreeService(toolName, args);
  }
  
  return await mcpClient.callTool(toolName, args);
}
```

#### 性能不达标

**应对策略**：
1. **性能监控**：实时监控性能指标
2. **性能优化**：使用缓存、批量调用、异步调用
3. **降级策略**：性能不达标时，降级到更快的服务
4. **告警机制**：性能不达标时及时告警

**实施代码**：
```typescript
async function callWithPerformanceCheck(toolName: string, args: any) {
  const startTime = Date.now();
  
  try {
    const result = await mcpClient.callTool(toolName, args);
    const latency = Date.now() - startTime;
    
    // 记录性能指标
    await performanceMonitor.recordCall('service', toolName, latency, true);
    
    // 检查性能
    if (latency > PERFORMANCE_THRESHOLD) {
      await alertService.sendAlert({
        level: 'WARNING',
        message: `Performance degraded: ${toolName} took ${latency}ms`,
      });
    }
    
    return result;
  } catch (error) {
    await performanceMonitor.recordCall('service', toolName, Date.now() - startTime, false);
    throw error;
  }
}
```

#### 用户不接受

**应对策略**：
1. **用户调研**：收集用户反馈，了解用户需求
2. **A/B 测试**：通过 A/B 测试验证能力价值
3. **逐步推广**：先小规模测试，再逐步推广
4. **快速迭代**：根据用户反馈快速调整

**实施代码**：
```typescript
// A/B 测试框架
async function callWithABTest(toolName: string, args: any, userId: string) {
  const variant = await abTestService.getVariant(userId, 'mcp_capabilities');
  
  if (variant === 'control') {
    // 对照组：不使用 MCP 能力
    return await legacyService.call(toolName, args);
  } else {
    // 实验组：使用 MCP 能力
    return await mcpClient.callTool(toolName, args);
  }
}
```

### 3. 应急预案

#### 服务完全不可用

**应急预案**：
1. **立即切换**：切换到备用服务或降级方案
2. **用户通知**：通知用户服务暂时不可用
3. **问题排查**：立即排查问题原因
4. **恢复计划**：制定恢复计划和时间表

#### 成本突然飙升

**应急预案**：
1. **立即限制**：限制调用频率，暂停非关键服务
2. **成本分析**：分析成本飙升原因
3. **优化措施**：实施成本优化措施
4. **预算调整**：如需要，调整预算

---

## 🔍 竞品对比分析

### 1. 与传统旅行产品对比

| 维度 | 传统旅行产品 | TripNARA（MCP 能力） | 优势 |
|------|------------|---------------------|------|
| **信息收集** | 静态数据库 | Exa Web搜索 + Google Maps | ✅ 实时、全面 |
| **住宿推荐** | 单一来源 | Hotel + Airbnb | ✅ 选择更多 |
| **交通规划** | 基础路线 | Google Maps + Amadeus + Rail | ✅ 多模式交通 |
| **实时能力** | 有限 | Weather + Restaurant + Calendar | ✅ 实时更新 |
| **执行能力** | 手动操作 | Calendar + Stripe | ✅ 自动化执行 |

### 2. 与 AI 旅行助手对比

| 维度 | 其他 AI 助手 | TripNARA（MCP 能力） | 优势 |
|------|------------|---------------------|------|
| **能力配置** | 单一能力 | 系统化能力组合 | ✅ 更全面 |
| **实施方式** | 一次性集成 | 分阶段实施 | ✅ 更灵活 |
| **错误处理** | 基础处理 | 完善的降级策略 | ✅ 更可靠 |
| **成本控制** | 无控制 | 完善的成本监控 | ✅ 更可控 |
| **性能优化** | 无优化 | 缓存、批量、异步 | ✅ 更高效 |

### 3. 差异化优势

1. **系统化能力配置**：不是简单的 API 集成，而是系统化的能力组合策略
2. **分阶段实施**：P0/P1/P2 优先级清晰，分阶段实施，风险可控
3. **完善的监控**：性能监控、成本监控、业务指标监控
4. **智能降级**：完善的降级策略，确保服务可用性
5. **成本可控**：完善的成本监控和优化策略

---

**文档维护**: AI 科学家团队  
**最后更新**: 2026-02-07  
**下次审查**: 2026-03-07
