# MCP 能力清单与产品路线图

**文档版本**: v2.0  
**更新日期**: 2026-02-07  
**目标受众**: 产品经理、技术团队、决策者

**注意**: 详细的产品经理 + AI 科学家联合评估请参考 [MCP_SERVICES_EVALUATION.md](./MCP_SERVICES_EVALUATION.md)

---

## 📊 执行摘要

### 当前状态
- ✅ **已集成 MCP 服务**: 10 个
- ✅ **已集成 Skills**: 50+ 个（通过 MCP Skills Server 暴露）
- ✅ **总工具数**: 100+ 个
- ✅ **集成方式**: 混合模式（MCP 服务器 + Skills 系统）
- 📈 **成熟度**: 生产可用

### 核心能力覆盖
- ✅ 地图服务（Google Maps Direct API）
- ✅ 天气服务（Weather Direct API）
- ✅ 住宿搜索（Airbnb）
- ✅ 航班搜索（Amadeus）
- ✅ 铁路查询（Rail MCP）
- ✅ 日历管理（Google Calendar）
- ✅ 数据库操作（PostgreSQL）
- ✅ Web 搜索（Exa）
- ✅ 浏览器自动化（Browserbase）
- ✅ 文件提取（File Extractor）
- ⚠️ 租车服务（Booking.com - 非 MCP）
- ❌ 支付服务（待集成）
- ❌ 酒店预订（待集成）
- ❌ 餐饮推荐（待集成）

---

## 🎯 第一部分：当前 MCP 能力清单

### 1. Google Calendar MCP ⭐⭐⭐⭐⭐

**服务类型**: 远程 HTTP/SSE MCP 服务器  
**服务 URL**: `https://server.smithery.ai/googlecalendar`  
**集成状态**: ✅ 已集成并可用

#### 核心能力
- ✅ **事件管理**: 创建、读取、更新、删除日历事件
- ✅ **日历管理**: 列出、创建、更新、删除日历
- ✅ **时间查询**: 获取当前日期时间、查找空闲时间段
- ✅ **快速添加**: 使用自然语言创建事件
- ✅ **参与者管理**: 添加/移除事件参与者

#### 工具列表（29个）
- `events_list` - 列出日历事件
- `create_event` - 创建新事件
- `delete_event` - 删除事件
- `patch_event` - 部分更新事件
- `update_event` - 完整更新事件
- `find_event` - 查找特定事件
- `list_calendars` - 列出所有日历
- `get_calendar` - 获取日历详情
- `create_calendar` - 创建新日历
- `delete_calendar` - 删除日历
- `update_calendar` - 更新日历
- `get_current_date_time` - 获取当前日期时间
- `find_free_slots` - 查找空闲时间段
- `quick_add` - 快速添加事件（自然语言）
- `remove_attendee` - 移除参与者
- `add_attendee` - 添加参与者
- ... 等 29 个工具

#### 使用场景
- ✅ 将 TripNara 行程同步到 Google Calendar
- ✅ 检查用户可用时间
- ✅ 行程变更时自动更新日历事件
- ✅ 创建行程提醒

#### 认证方式
- **OAuth 2.0**（用户级别）
- 前端需要集成授权流程

---

### 2. Airbnb MCP ⭐⭐⭐⭐

**服务类型**: 本地 stdio MCP 服务器（npm 包）  
**服务包**: `@openbnb/mcp-server-airbnb`  
**集成状态**: ✅ 已集成并可用

#### 核心能力
- ✅ **房源搜索**: 支持位置、日期、客人数量、价格范围等过滤
- ✅ **房源详情**: 获取详细房源信息（设施、规则、位置等）
- ✅ **无需 API Key**: 通过访问 Airbnb 公开网站获取信息

#### 工具列表（2个）
- `airbnb.search` - 搜索 Airbnb 房源
- `airbnb.listingDetails` - 获取房源详细信息

#### 使用场景
- ✅ 在行程规划中搜索住宿
- ✅ 根据预算筛选房源
- ✅ 比较多个房源
- ✅ 获取房源详细信息用于决策

#### 认证方式
- **无需认证**（公开数据）
- 遵守 robots.txt（可配置忽略）

---

### 3. Amadeus MCP ⭐⭐⭐⭐

**服务类型**: 远程 HTTP/SSE MCP 服务器  
**服务 URL**: `https://server.smithery.ai/@almogqwinz/mcp-amadeus-api`  
**集成状态**: ✅ 已集成并可用

#### 核心能力
- ✅ **航班搜索**: 搜索航班（需要 API 凭证）
- ✅ **实时数据**: 获取实时航班信息和价格

#### 工具列表
- `amadeus.searchFlights` - 搜索航班
- ... 其他工具（通过 Connect API 动态获取）

#### 使用场景
- ✅ 搜索航班
- ✅ 比较航班价格
- ✅ 获取航班详情

#### 认证方式
- **API Key**（服务级别）
- 需要配置 Amadeus API 凭证

---

### 4. Browserbase MCP ⭐⭐⭐⭐

**服务类型**: 远程 HTTP/SSE MCP 服务器  
**服务 URL**: `https://server.smithery.ai/@browserbasehq/mcp-browserbase`  
**集成状态**: ✅ 已集成并可用

#### 核心能力
- ✅ **浏览器会话**: 创建和管理浏览器会话
- ✅ **页面导航**: 导航到指定 URL
- ✅ **截图**: 捕获页面截图
- ✅ **交互操作**: 点击元素、输入文本
- ✅ **JavaScript 执行**: 在页面中执行 JavaScript

#### 工具列表（5个）
- `browserbase.createSession` - 创建浏览器会话
- `browserbase.navigate` - 导航到 URL
- `browserbase.screenshot` - 截图
- `browserbase.click` - 点击元素
- `browserbase.evaluate` - 执行 JavaScript

#### 使用场景
- ✅ 数据抓取（从网站获取信息）
- ✅ 自动化测试
- ✅ 页面内容提取
- ✅ 动态内容处理

#### 认证方式
- **API Key**（服务级别）
- 需要 Browserbase API Key 和 Project ID

---

### 5. PostgreSQL MCP ⭐⭐⭐⭐

**服务类型**: 远程 HTTP/SSE MCP 服务器  
**服务 URL**: `https://server.smithery.ai/1Levick3/postgresql-mcp-server`  
**集成状态**: ✅ 已集成并可用

#### 核心能力
- ✅ **SQL 查询**: 执行 SELECT 查询
- ✅ **数据操作**: 执行 INSERT, UPDATE, DELETE
- ✅ **安全执行**: 通过 MCP 协议安全执行数据库操作

#### 工具列表（2个）
- `postgresql.query` - 执行 SQL 查询（SELECT）
- `postgresql.execute` - 执行 SQL 命令（INSERT/UPDATE/DELETE）

#### 使用场景
- ✅ 数据查询和分析
- ✅ 数据操作（创建/更新/删除）
- ✅ 数据迁移和备份
- ✅ 数据验证和清理

#### 认证方式
- **数据库连接字符串**（管理员配置）
- 不需要用户授权

---

### 6. Exa MCP ⭐⭐⭐⭐

**服务类型**: 远程 HTTP/SSE MCP 服务器  
**服务 URL**: `https://mcp.exa.ai/mcp`  
**集成状态**: ✅ 已集成并可用

#### 核心能力
- ✅ **Web 搜索**: 语义化 Web 搜索
- ✅ **代码搜索**: 搜索代码上下文
- ✅ **公司研究**: 公司信息研究
- ✅ **网页爬取**: 爬取网页内容
- ✅ **深度研究**: 深度研究和分析
- ✅ **人员搜索**: 搜索人员信息

#### 工具列表（9+个）
- `web_search_exa` - Web 搜索
- `get_code_context_exa` - 代码上下文搜索
- `company_research_exa` - 公司研究
- `web_search_advanced_exa` - 高级 Web 搜索
- `deep_search_exa` - 深度搜索
- `crawling_exa` - 网页爬取
- `people_search_exa` - 人员搜索
- `deep_researcher_start` - 启动深度研究
- `deep_researcher_check` - 检查深度研究状态
- `monitoring/stats` - 使用统计
- `monitoring/cost-check` - 成本检查

#### 使用场景
- ✅ 搜索目的地信息
- ✅ 研究景点和活动
- ✅ 获取实时信息
- ✅ 内容分析和研究

#### 认证方式
- **API Key**（服务级别）
- 需要 Exa API Key

---

### 7. Booking.com (RapidAPI) ⚠️

**服务类型**: RapidAPI（非 MCP）  
**集成状态**: ⚠️ 已集成但非 MCP 方式

#### 核心能力
- ✅ **租车搜索**: 搜索租车服务
- ✅ **价格对比**: 多个租车公司价格对比

#### 使用场景
- ✅ 路线规划中的租车需求
- ✅ 关键节点的租车可用性检查

#### 认证方式
- **RapidAPI Key**（服务级别）

---

### 8. TripNARA Skills（通过 MCP Skills Server）⭐⭐⭐⭐⭐

**服务类型**: 本地 Skills 系统（通过 MCP 暴露）  
**集成状态**: ✅ 已集成并可用

#### 核心能力（部分示例）
- ✅ **天气查询**: `tripnara.weather.search`
- ✅ **营业时间**: `tripnara.opening_hours.get`
- ✅ **POI 搜索**: `tripnara.poi.search`
- ✅ **Web 浏览**: `tripnara.web.browse`
- ✅ **路线规划**: 多个路线相关 Skills
- ✅ **决策支持**: Abu, Dr.Dre, Neptune 等决策 Skills

#### 工具列表
- 动态注册所有 Skills 为 MCP 工具
- 工具名称格式: `tripnara.{skill_name}`

---

## 🚀 第二部分：建议新增的 MCP 服务

### P0 - 核心优先级（必须新增）

#### 1. Google Maps Direct API ⭐⭐⭐⭐⭐

**优先级**: P0（最高）  
**业务价值**: ⭐⭐⭐⭐⭐  
**技术难度**: ⭐⭐⭐  
**状态**: ✅ 已完成（直接 API 集成）

**为什么需要**:
- ✅ **核心功能**: 地图和位置服务是旅行规划的基础
- ✅ **路线规划**: 需要地图 API 进行路线计算、导航
- ✅ **地点搜索**: 搜索景点、餐厅、酒店等 POI
- ✅ **地理编码**: 地址与坐标转换
- ✅ **距离计算**: 计算地点间距离和时间

**可用服务**:
- Smithery: `https://smithery.ai/servers` 搜索 "Google Maps"
- 或直接使用 Google Maps API（需要创建 MCP 桥接）

**预期工具**:
- `maps.searchPlaces` - 搜索地点
- `maps.getPlaceDetails` - 获取地点详情
- `maps.getDirections` - 获取路线
- `maps.geocode` - 地理编码
- `maps.reverseGeocode` - 反向地理编码
- `maps.calculateDistance` - 计算距离

**集成工作量**: 中等（2-3 天）

**已完成**: 
- ✅ 直接集成 Google Maps API（使用 API Key）
- ✅ 已创建服务、模块、控制器
- ✅ 已集成到 MCP Skills Server
- ✅ 提供 4 个工具：getRoute, computeDistanceMatrix, geocode, searchPlaces
- 📝 参考: [Google Maps Direct 集成指南](./GOOGLE_MAPS_DIRECT_INTEGRATION.md)

---

#### 2. Weather MCP ⭐⭐⭐⭐⭐

**优先级**: P0（最高）  
**业务价值**: ⭐⭐⭐⭐⭐  
**技术难度**: ⭐⭐  
**状态**: ✅ 已完成

**为什么需要**:
- ✅ **行程规划**: 天气影响行程安排
- ✅ **活动推荐**: 根据天气推荐室内/室外活动
- ✅ **实时预警**: 恶劣天气预警
- ✅ **多日预报**: 多日天气预报

**可用服务**:
- Smithery: `https://smithery.ai/server/@isdaniel/mcp_weather_server`
- Python 包: `mcp_weather_server` (使用 Open-Meteo API，无需 API Key)

**已实现工具**:
- ✅ `weather.getCurrentWeather` - 获取当前天气
- ✅ `weather.getWeatherByDatetimeRange` - 获取日期范围内的天气
- ✅ `weather.getCurrentDateTime` - 获取指定时区的当前时间

**集成说明**:
- ✅ 已创建 `weather-client.ts` 客户端
- ✅ 已集成到 `mcp-skills-server.ts`
- ✅ 已创建测试脚本 `scripts/test-weather-mcp.ts`
- 📝 参考: [Weather MCP 集成指南](./WEATHER_MCP_INTEGRATION.md)

**安装要求**:
```bash
python3 -m pip install mcp_weather_server
```

**集成工作量**: 已完成（1 天）

---

#### 3. Payment/Stripe MCP ⭐⭐⭐⭐⭐

**优先级**: P0（最高）  
**业务价值**: ⭐⭐⭐⭐⭐  
**技术难度**: ⭐⭐⭐⭐

**为什么需要**:
- ✅ **预订支付**: 用户需要支付住宿、航班等预订
- ✅ **支付处理**: 安全的支付处理流程
- ✅ **支付历史**: 管理支付记录
- ✅ **退款处理**: 处理退款请求

**可用服务**:
- Smithery: 搜索 "Stripe" 或 "Payment"
- 或直接使用 Stripe API（需要创建 MCP 桥接）

**预期工具**:
- `payment.createIntent` - 创建支付意图
- `payment.confirmPayment` - 确认支付
- `payment.getPaymentStatus` - 获取支付状态
- `payment.refund` - 退款

**集成工作量**: 高（5-7 天，需要安全审查）

---

### P1 - 高优先级（优先新增）

#### 4. Hotel Booking MCP ⭐⭐⭐⭐

**优先级**: P1（高）  
**业务价值**: ⭐⭐⭐⭐  
**技术难度**: ⭐⭐⭐

**为什么需要**:
- ✅ **补充 Airbnb**: Airbnb 主要覆盖民宿，需要传统酒店
- ✅ **价格对比**: 提供更多住宿选择
- ✅ **全球覆盖**: 某些地区 Airbnb 覆盖不足

**可用服务**:
- Booking.com MCP（如果可用）
- Hotels.com API
- Expedia API

**预期工具**:
- `hotels.search` - 搜索酒店
- `hotels.getDetails` - 获取酒店详情
- `hotels.checkAvailability` - 检查可用性
- `hotels.book` - 预订酒店

**集成工作量**: 中等（3-4 天）

---

#### 5. Train/Railway MCP ⭐⭐⭐⭐

**优先级**: P1（高）  
**业务价值**: ⭐⭐⭐⭐  
**技术难度**: ⭐⭐⭐  
**状态**: ✅ 已完成

**为什么需要**:
- ✅ **欧洲市场**: 欧洲铁路网络发达
- ✅ **环保选择**: 铁路是环保的交通方式
- ✅ **城市间移动**: 某些路线铁路比飞机更便捷

**可用服务**:
- Smithery: `https://smithery.ai/server/DeniseLewis200081/rail`

**已实现工具**:
- ✅ 动态工具发现（工具列表在连接时自动发现）
- ✅ 工具名称格式: `rail.{tool_name}`

**集成说明**:
- ✅ 已创建 `rail-client.ts` 客户端
- ✅ 已创建 `rail-bridge-server.ts` 桥接服务器
- ✅ 已集成到 `mcp-skills-server.ts`
- ✅ 已创建测试脚本和认证助手
- 📝 参考: [Rail MCP 集成指南](./RAIL_MCP_INTEGRATION.md)

**安装要求**:
- 需要 OAuth 认证（运行 `npm run mcp:auth:rail`）

**集成工作量**: 已完成（1 天）

---

#### 6. Restaurant/Food MCP ⭐⭐⭐⭐

**优先级**: P1（高）  
**业务价值**: ⭐⭐⭐⭐  
**技术难度**: ⭐⭐⭐

**为什么需要**:
- ✅ **餐饮推荐**: 推荐当地美食
- ✅ **餐厅预订**: 预订餐厅
- ✅ **菜单信息**: 获取菜单和价格
- ✅ **评价和评分**: 用户评价和评分

**可用服务**:
- Yelp API
- Google Places API（餐饮类别）
- OpenTable API

**预期工具**:
- `restaurant.search` - 搜索餐厅
- `restaurant.getDetails` - 获取餐厅详情
- `restaurant.getMenu` - 获取菜单
- `restaurant.makeReservation` - 预订餐厅

**集成工作量**: 中等（3-4 天）

---

### P2 - 中优先级（可选新增）

#### 7. Currency Exchange MCP ⭐⭐⭐

**优先级**: P2（中）  
**业务价值**: ⭐⭐⭐  
**技术难度**: ⭐⭐

**为什么需要**:
- ✅ **货币转换**: 显示不同货币的价格
- ✅ **汇率查询**: 实时汇率信息
- ✅ **预算规划**: 帮助用户规划预算

**可用服务**:
- ExchangeRate API
- CurrencyLayer API

**预期工具**:
- `currency.convert` - 货币转换
- `currency.getRates` - 获取汇率
- `currency.getHistoricalRates` - 获取历史汇率

**集成工作量**: 低（1-2 天）

---

#### 8. Translation MCP ⭐⭐⭐

**优先级**: P2（中）  
**业务价值**: ⭐⭐⭐  
**技术难度**: ⭐⭐

**为什么需要**:
- ✅ **多语言支持**: 翻译目的地信息
- ✅ **用户界面**: 多语言界面
- ✅ **内容本地化**: 本地化内容

**可用服务**:
- Google Translate API
- DeepL API

**预期工具**:
- `translation.translate` - 翻译文本
- `translation.detectLanguage` - 检测语言
- `translation.getSupportedLanguages` - 获取支持的语言

**集成工作量**: 低（1-2 天）

---

#### 9. Image/Photo MCP ⭐⭐⭐

**优先级**: P2（中）  
**业务价值**: ⭐⭐⭐  
**技术难度**: ⭐⭐⭐

**为什么需要**:
- ✅ **景点图片**: 获取景点图片
- ✅ **用户上传**: 用户上传旅行照片
- ✅ **图片处理**: 图片优化和处理

**可用服务**:
- Unsplash API
- Pexels API
- Cloudinary API

**预期工具**:
- `image.search` - 搜索图片
- `image.upload` - 上传图片
- `image.process` - 处理图片

**集成工作量**: 中等（2-3 天）

---

#### 10. Social Media MCP ⭐⭐

**优先级**: P2（低）  
**业务价值**: ⭐⭐  
**技术难度**: ⭐⭐⭐⭐

**为什么需要**:
- ✅ **分享行程**: 分享到社交媒体
- ✅ **社交登录**: 使用社交账号登录
- ✅ **内容同步**: 同步社交媒体内容

**可用服务**:
- Twitter/X API
- Instagram API
- Facebook API

**预期工具**:
- `social.post` - 发布内容
- `social.getFeed` - 获取动态
- `social.share` - 分享内容

**集成工作量**: 高（5-7 天，需要 OAuth 集成）

---

## 📋 第三部分：集成优先级矩阵

### 优先级评估标准

| 优先级 | 业务价值 | 技术难度 | 用户需求 | 集成时间 |
|--------|---------|---------|---------|---------|
| P0 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 极高 | 1-2 周 |
| P1 | ⭐⭐⭐⭐ | ⭐⭐⭐ | 高 | 2-3 周 |
| P2 | ⭐⭐⭐ | ⭐⭐ | 中 | 1-2 周 |

### 推荐实施顺序

**第一阶段（Q1）**:
1. ✅ Google Maps MCP
2. ✅ Weather MCP
3. ✅ Payment/Stripe MCP

**第二阶段（Q2）**:
4. ✅ Hotel Booking MCP
5. ✅ Train/Railway MCP
6. ✅ Restaurant/Food MCP

**第三阶段（Q3-Q4）**:
7. ✅ Currency Exchange MCP
8. ✅ Translation MCP
9. ✅ Image/Photo MCP
10. ✅ Social Media MCP（可选）

---

## 🔍 第四部分：服务发现与评估

### 如何发现新的 MCP 服务

1. **Smithery.ai 平台**
   - 访问: https://smithery.ai/servers
   - 使用语义搜索: "travel", "booking", "maps", "weather" 等
   - 筛选分类: Weather, Platform APIs, Browser Automation 等

2. **GitHub MCP Servers**
   - 搜索: "mcp-server" + 关键词
   - 查看: https://github.com/smithery-ai/mcp-servers

3. **社区资源**
   - MCP Discord 社区
   - Anthropic 官方文档

### 评估新服务的标准

**技术评估**:
- ✅ MCP 协议兼容性
- ✅ 文档完整性
- ✅ 代码质量和维护状态
- ✅ 错误处理和重试机制

**业务评估**:
- ✅ 功能匹配度
- ✅ 数据质量和准确性
- ✅ API 限制和配额
- ✅ 成本和定价

**集成评估**:
- ✅ 认证复杂度
- ✅ 集成工作量
- ✅ 维护成本
- ✅ 依赖关系

---

## 📊 第五部分：能力对比矩阵

### 当前能力 vs 目标能力

| 能力类别 | 当前状态 | 目标状态 | 差距 |
|---------|---------|---------|------|
| **住宿** | ✅ Airbnb | ✅ Airbnb + Hotels | 需要 Hotels |
| **交通** | ✅ 航班 (Amadeus) | ✅ 航班 + 火车 + 租车 | 需要火车、完善租车 |
| **日历** | ✅ Google Calendar | ✅ Google Calendar | ✅ 完成 |
| **搜索** | ✅ Exa Web Search | ✅ Exa + Maps Search | 需要 Maps |
| **天气** | ⚠️ Skills 中有 | ✅ 专用 Weather MCP | 需要专用服务 |
| **支付** | ❌ 无 | ✅ Stripe/Payment | 需要支付 |
| **餐饮** | ⚠️ POI Search | ✅ 专用 Restaurant MCP | 需要专用服务 |
| **地图** | ❌ 无 | ✅ Google Maps | 需要地图 |
| **图片** | ❌ 无 | ✅ Image MCP | 需要图片服务 |
| **翻译** | ❌ 无 | ✅ Translation MCP | 需要翻译 |

---

## 🎯 第六部分：产品建议总结

### 立即行动项（P0）

1. **Google Maps MCP** - 核心基础设施
   - 影响: 高（影响所有路线规划功能）
   - 工作量: 中等
   - 建议: 立即开始评估和集成

2. **Weather MCP** - 用户体验提升
   - 影响: 高（影响行程规划质量）
   - 工作量: 低
   - 建议: 快速集成

3. **Payment MCP** - 商业化必需
   - 影响: 极高（影响商业化）
   - 工作量: 高（需要安全审查）
   - 建议: 提前规划，分阶段实施

### 短期规划（P1 - Q2）

4. **Hotel Booking MCP** - 完善住宿选择
5. **Train/Railway MCP** - 扩大交通选择
6. **Restaurant/Food MCP** - 增强餐饮推荐

### 长期规划（P2 - Q3-Q4）

7-10. 根据用户反馈和业务需求灵活调整

---

## 📚 附录：相关资源

### 文档资源
- [MCP 服务器集成总结](./MCP_SERVERS_SUMMARY.md)
- [Google Calendar 集成指南](./GOOGLE_CALENDAR_INTEGRATION.md)
- [Airbnb 集成指南](./AIRBNB_INTEGRATION.md)
- [Amadeus 集成指南](./AMADEUS_INTEGRATION.md)

### 外部资源
- [Smithery.ai 平台](https://smithery.ai/servers)
- [MCP SDK 文档](https://modelcontextprotocol.io/)
- [Anthropic MCP 文档](https://docs.anthropic.com/mcp)

---

**文档维护**: 产品团队  
**最后更新**: 2026-02-06  
**下次审查**: 2026-03-06
