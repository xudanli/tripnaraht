# MCP 能力快速参考

**快速查看版本** - 详细版本请参考 [MCP_CAPABILITIES_AND_ROADMAP.md](./MCP_CAPABILITIES_AND_ROADMAP.md)

---

## ✅ 当前已集成的 MCP 服务（7个）

| 服务 | 状态 | 工具数 | 主要功能 | 认证方式 |
|------|------|--------|---------|---------|
| **Google Calendar** | ✅ | 29 | 日历事件管理 | OAuth 2.0 |
| **Airbnb** | ✅ | 2 | 房源搜索、详情 | 无需认证 |
| **Amadeus** | ✅ | 多个 | 航班搜索 | API Key |
| **Browserbase** | ✅ | 5 | 浏览器自动化 | API Key |
| **PostgreSQL** | ✅ | 2 | 数据库操作 | 连接字符串 |
| **Exa** | ✅ | 9+ | Web搜索、研究 | API Key |
| **Booking.com** | ⚠️ | - | 租车搜索 | RapidAPI Key |

---

## 🎯 建议新增的 MCP 服务（按优先级）

### P0 - 核心优先级（必须）

1. **Google Maps MCP** ⭐⭐⭐⭐⭐
   - **为什么**: 地图和位置服务是旅行规划的基础
   - **功能**: 地点搜索、路线规划、地理编码、距离计算
   - **工作量**: 2-3 天

2. **Weather MCP** ⭐⭐⭐⭐⭐
   - **为什么**: 天气影响行程安排和活动推荐
   - **功能**: 当前天气、天气预报、天气预警
   - **工作量**: 1-2 天

3. **Payment/Stripe MCP** ⭐⭐⭐⭐⭐
   - **为什么**: 商业化必需，用户需要支付预订
   - **功能**: 支付处理、支付历史、退款
   - **工作量**: 5-7 天（需要安全审查）

### P1 - 高优先级（优先）

4. **Hotel Booking MCP** ⭐⭐⭐⭐
   - **为什么**: 补充 Airbnb，提供传统酒店选择
   - **工作量**: 3-4 天

5. **Train/Railway MCP** ⭐⭐⭐⭐
   - **为什么**: 欧洲市场重要，环保交通方式
   - **工作量**: 3-4 天

6. **Restaurant/Food MCP** ⭐⭐⭐⭐
   - **为什么**: 餐饮推荐和预订
   - **工作量**: 3-4 天

### P2 - 中优先级（可选）

7. **Currency Exchange MCP** ⭐⭐⭐
8. **Translation MCP** ⭐⭐⭐
9. **Image/Photo MCP** ⭐⭐⭐
10. **Social Media MCP** ⭐⭐

---

## 📊 能力覆盖矩阵

| 能力类别 | 当前 | 目标 | 优先级 |
|---------|------|------|--------|
| 住宿 | ✅ Airbnb | ✅ Airbnb + Hotels | P1 |
| 交通 | ✅ 航班 | ✅ 航班 + 火车 + 租车 | P1 |
| 日历 | ✅ Google Calendar | ✅ Google Calendar | ✅ |
| 搜索 | ✅ Exa | ✅ Exa + Maps | P0 |
| 天气 | ⚠️ Skills | ✅ Weather MCP | P0 |
| 支付 | ❌ | ✅ Stripe | P0 |
| 餐饮 | ⚠️ POI | ✅ Restaurant MCP | P1 |
| 地图 | ❌ | ✅ Google Maps | P0 |

---

## 🚀 推荐实施路线图

### Q1（第一阶段）
- ✅ Google Maps MCP
- ✅ Weather MCP
- ✅ Payment/Stripe MCP

### Q2（第二阶段）
- ✅ Hotel Booking MCP
- ✅ Train/Railway MCP
- ✅ Restaurant/Food MCP

### Q3-Q4（第三阶段）
- ✅ Currency Exchange MCP
- ✅ Translation MCP
- ✅ Image/Photo MCP

---

## 🔍 如何发现新服务

1. **Smithery.ai**: https://smithery.ai/servers
2. **GitHub**: 搜索 "mcp-server" + 关键词
3. **社区**: MCP Discord、Anthropic 文档

---

**详细文档**: [MCP_CAPABILITIES_AND_ROADMAP.md](./MCP_CAPABILITIES_AND_ROADMAP.md)
