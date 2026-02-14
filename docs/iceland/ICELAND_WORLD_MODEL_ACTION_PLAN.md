# 冰岛世界模型数据补齐执行清单

> **生成时间**: 2026-02-13
> **整体完成度**: 78% → 目标 95%+
> **预计完成时间**: 4-6 周
> **负责团队**: TripNARA 数据 + 后端 + QA 团队

---

## 📊 当前状态总结

### ✅ 已完成（优秀）
- DEM 数据：20m 高精度，27,490 瓦片 ⭐⭐⭐⭐⭐
- F-road 静态数据：20 条主要 F-road 完整标注 ⭐⭐⭐⭐⭐
- 路线哲学：8 个主要路线，失败画像清晰 ⭐⭐⭐⭐⭐
- 道路危险标注：河流穿越、陡坡等 ⭐⭐⭐⭐☆

### ⚠️ 需要改进
- POI 数量：159 个（需要 200+）
- POI 地理位置覆盖率：83.6%（需要 90%+）
- POI 开放时间覆盖率：33.3%（需要 50%+）
- 加油站数据：0 个（需要 10+）❌
- 实时数据集成：无（需要 road.is + 天气 API）❌
- 数据新鲜度管理：无 lastVerifiedAt 字段 ❌

---

## 🚨 P0 必须补齐（2-3 周）

### Phase 1: 数据收集与导入（Week 1-2）

#### 1.1 POI 数据补齐

**负责人**: 数据团队 + 后端工程师
**时间**: Week 1-2

- [ ] **Step 1**: 统计现有冰岛 POI 分类分布（已完成 ✅）
  - 总计：159 个
  - 缺口：加油站 0 个、露营地 0 个、停车场 0 个

- [ ] **Step 2**: 从官方源收集加油站数据（Week 1）
  - [ ] N1 官网爬取：https://www.n1.is/stodvar/
  - [ ] Orkan 官网爬取：https://www.orkan.is/stodvar/
  - [ ] Olís 官网爬取：https://www.olis.is/stodvar/
  - [ ] 目标：至少 10 个 F-road 沿线加油站

- [ ] **Step 3**: 收集高地小屋数据（Week 1）
  - [ ] Ferðafélag Íslands API/网站：https://www.fi.is/en/mountain-huts
  - [ ] 目标：至少 10 个高地小屋（含预订状态）

- [ ] **Step 4**: Google Maps API 批量搜索（Week 1-2）
  - [ ] 搜索"加油站 冰岛"（category: gas_station）
  - [ ] 搜索"露营地 冰岛"（category: campground）
  - [ ] 搜索"停车场 冰岛"（category: parking）
  - [ ] 搜索"餐厅 冰岛"（category: restaurant）
  - [ ] 目标：补充至少 50+ 个 POI

- [ ] **Step 5**: 数据清洗和导入（Week 2）
  - [ ] 统一 GPS 坐标格式（WGS84）
  - [ ] 验证开放时间格式
  - [ ] 补充 dataSource、lastVerifiedAt 字段
  - [ ] 运行导入脚本（`scripts/import-iceland-pois-batch.ts`）

- [ ] **Step 6**: 验证导入结果（Week 2）
  - [ ] 运行 `scripts/analyze-iceland-poi-coverage.ts`
  - [ ] 确认地理位置覆盖率 >= 90%
  - [ ] 确认开放时间覆盖率 >= 50%
  - [ ] 确认加油站 >= 10 个

**完成标准**:
- ✅ 冰岛 POI 总数 >= 200 个
- ✅ 加油站 >= 10 个
- ✅ 高地小屋 >= 10 个
- ✅ 地理位置覆盖率 >= 90%
- ✅ 开放时间覆盖率 >= 50%

---

#### 1.2 F-road 服务设施数据

**负责人**: 数据团队
**时间**: Week 1-2

- [ ] **Step 1**: 整理紧急救援站数据（Week 1）
  - [ ] 联系 ICE-SAR 获取官方数据
  - [ ] 手动整理至少 5 个救援站
  - [ ] 补充紧急联系方式

- [ ] **Step 2**: 整理河流穿越点数据（Week 1-2）
  - [ ] 参考地图和论坛（r/VisitingIceland）
  - [ ] 标注 GPS 坐标（精度 < 10m）
  - [ ] 标注难度、水深、最佳时间
  - [ ] 目标：至少 10 个关键河流穿越点

- [ ] **Step 3**: 创建 POI 导入脚本（Week 1）
  - [ ] `scripts/import-iceland-service-facilities.ts`
  - [ ] 支持批量导入
  - [ ] 自动验证数据格式

- [ ] **Step 4**: 导入和验证（Week 2）
  - [ ] 运行导入脚本
  - [ ] 验证数据完整性
  - [ ] 测试 POI 搜索功能

**完成标准**:
- ✅ 紧急救援站 >= 5 个
- ✅ 河流穿越点 >= 10 个（含难度和水深）

**参考文档**:
- [F-road 服务设施清单](./docs/iceland/data/F_ROAD_SERVICE_FACILITIES_CHECKLIST.md)

---

### Phase 2: 实时 API 集成（Week 2-3）

#### 2.1 road.is API 集成

**负责人**: 后端工程师
**时间**: Week 2

- [ ] **Step 1**: 研究 road.is API 文档（Day 1）
  - [ ] 测试 API 端点：`https://api.road.is/api/condition`
  - [ ] 确认响应格式和字段

- [ ] **Step 2**: 实现 RoadStatusRealtimeService（Day 1-2）
  - [ ] 创建 `src/skills/world/services/road-status-realtime.service.ts`
  - [ ] 实现 API 调用逻辑
  - [ ] 添加 15 分钟缓存
  - [ ] 数据转换为 TripNARA 格式

- [ ] **Step 3**: 实现每日批量爬取（Day 3）
  - [ ] 创建 `scripts/cron/sync-road-status-daily.ts`
  - [ ] 设置 Cron job（每天 6:00 UTC）
  - [ ] 存储历史数据

- [ ] **Step 4**: 集成到 Should-Exist Gate（Day 4）
  - [ ] 修改 `src/skills/world/gate.should_exist.skill.ts`
  - [ ] 检查 F-road 实时状态
  - [ ] F-road 关闭 → 返回 BLOCK 或 ADJUST_REQUIRED

- [ ] **Step 5**: 测试和监控（Day 5）
  - [ ] 单元测试
  - [ ] 集成测试
  - [ ] 监控 API 可用性和响应时间

**完成标准**:
- ✅ road.is API 成功集成
- ✅ 缓存命中率 >= 80%
- ✅ API 响应时间 < 2 秒
- ✅ Should-Exist Gate 能检测 F-road 关闭状态

**参考文档**:
- [实时 API 集成方案](./docs/iceland/integration/REALTIME_API_INTEGRATION_PLAN.md)

---

#### 2.2 Veðurstofa Íslands API 集成

**负责人**: 后端工程师
**时间**: Week 3

- [ ] **Step 1**: 研究气象局 API 文档（Day 1）
  - [ ] 测试 API 端点
  - [ ] 确认高地气象站列表

- [ ] **Step 2**: 实现 IcelandWeatherRealtimeService（Day 1-2）
  - [ ] 创建 `src/skills/world/services/iceland-weather-realtime.service.ts`
  - [ ] 实现 API 调用和 XML 解析
  - [ ] 添加最近气象站查找逻辑
  - [ ] 添加 30 分钟缓存

- [ ] **Step 3**: 创建 WeatherForecastRealtime 表（Day 2）
  - [ ] Prisma migration
  - [ ] 存储天气预报历史数据

- [ ] **Step 4**: 集成到世界模型（Day 3）
  - [ ] 修改 `world.buildContext` skill
  - [ ] 添加高地天气风险评分

- [ ] **Step 5**: 测试和监控（Day 4-5）
  - [ ] 测试天气告警逻辑
  - [ ] 监控 API 可用性

**完成标准**:
- ✅ 天气 API 成功集成
- ✅ 高地天气预报可查询
- ✅ 天气告警能触发 ADJUST_REQUIRED

---

### Phase 3: Schema 改造（Week 2-3）

#### 3.1 lastVerifiedAt 字段添加

**负责人**: 后端工程师 + DBA
**时间**: Week 2

- [ ] **Step 1**: Prisma Schema 改造（Day 1）
  - [ ] 修改 `prisma/schema.prisma`
  - [ ] Place 表添加字段：lastVerifiedAt, dataSource, dataFreshness
  - [ ] 创建新表：RoadStatusRealtime, WeatherForecastRealtime, AvalancheRiskForecast

- [ ] **Step 2**: 生成迁移（Day 1）
  - [ ] `npx prisma migrate dev --name add_last_verified_at_timestamps`
  - [ ] 检查生成的 SQL

- [ ] **Step 3**: 运行迁移（Day 2）
  - [ ] 备份数据库
  - [ ] 运行迁移
  - [ ] 验证表结构

- [ ] **Step 4**: 数据回填（Day 2-3）
  - [ ] 运行 `scripts/backfill-last-verified-at.ts`
  - [ ] 为现有 POI 添加 lastVerifiedAt
  - [ ] 为现有道路状态添加 lastVerifiedAt

- [ ] **Step 5**: 实现新鲜度计算工具（Day 3-4）
  - [ ] `src/shared/utils/data-freshness.util.ts`
  - [ ] 定义新鲜度规则
  - [ ] 自动计算 FRESH/STALE/EXPIRED

- [ ] **Step 6**: Cron jobs 实现（Day 4-5）
  - [ ] `src/cron/data-freshness-monitor.cron.ts`
  - [ ] 每小时检查数据新鲜度
  - [ ] 自动更新过期数据

**完成标准**:
- ✅ Place 表所有记录有 lastVerifiedAt
- ✅ 新表创建完成
- ✅ 数据回填完成
- ✅ Cron jobs 正常运行

**参考文档**:
- [Schema 改造方案](./docs/iceland/schema/LAST_VERIFIED_AT_SCHEMA_MIGRATION.md)

---

## ⚠️ P1 重要补充（Week 4-6）

### Phase 4: 露营地和停车场数据

**负责人**: 数据团队
**时间**: Week 4

- [ ] 收集露营地数据（至少 20 个）
- [ ] 收集停车场数据（至少 10 个）
- [ ] 导入数据库
- [ ] 验证数据质量

---

### Phase 5: 雪崩和火山监测 API

**负责人**: 后端工程师
**时间**: Week 4-5

- [ ] Avalanche.is API 集成
  - [ ] 实现 AvalancheRiskService
  - [ ] 集成到 Should-Exist Gate
  - [ ] 危险等级 >= 4 阻塞行程

- [ ] IMO 地震/火山 API 集成
  - [ ] 实现 VolcanicActivityService
  - [ ] 监测高地地震活动

---

### Phase 6: 数据监控和告警

**负责人**: 后端工程师 + DevOps
**时间**: Week 5-6

- [ ] 数据新鲜度监控 Dashboard
  - [ ] 实现 DataFreshnessMetricsService
  - [ ] 可视化新鲜度分布
  - [ ] 显示过期数据清单

- [ ] 告警机制
  - [ ] API 连续失败 3 次 → 告警
  - [ ] 数据超过 1 小时未更新 → 告警
  - [ ] 降级到静态数据 → 记录日志

---

## 💎 P2 优化项（持续）

- [ ] 河流穿越点高精度 DEM（5-10m）
- [ ] 实时积雪深度 API
- [ ] 道路开放预测模型（基于历史数据）
- [ ] 道路难度量化（0-10 评分）
- [ ] 历史极端天气数据分析
- [ ] 搜救成本估算工具
- [ ] 历史事故数据库
- [ ] 用户反馈学习机制

---

## 📋 执行时间表（甘特图）

```
Week 1: POI 数据收集 + 加油站/小屋
Week 2: POI 导入 + road.is API + Schema 改造
Week 3: 天气 API + Schema 回填 + Cron jobs
Week 4: 露营地/停车场 + 雪崩 API
Week 5: 火山 API + 监控 Dashboard
Week 6: 测试、验证、优化
```

---

## 👥 团队分工

| 角色 | 负责任务 | 时间投入 |
|------|---------|---------|
| **数据工程师 A** | POI 收集、清洗、导入 | Week 1-2 全职 |
| **数据工程师 B** | F-road 服务设施、河流穿越点 | Week 1-2 全职 |
| **后端工程师 A** | road.is API、Schema 改造 | Week 2-3 全职 |
| **后端工程师 B** | 天气 API、雪崩 API | Week 3-5 全职 |
| **DevOps 工程师** | Cron jobs、监控 Dashboard | Week 3-6 兼职 |
| **QA 工程师** | 测试、验证 | Week 2-6 兼职 |
| **产品经理** | 需求确认、验收 | Week 1-6 兼职 |

---

## ✅ 最终验收标准

改造完成后，需满足：

### 数据覆盖率
- ✅ 冰岛 POI 总数 >= 200 个
- ✅ 加油站 >= 10 个
- ✅ 高地小屋 >= 10 个
- ✅ 紧急救援站 >= 5 个
- ✅ 河流穿越点 >= 10 个
- ✅ 地理位置覆盖率 >= 90%
- ✅ 开放时间覆盖率 >= 50%

### 实时数据集成
- ✅ road.is API 成功集成
- ✅ Veðurstofa Íslands API 成功集成
- ✅ Avalanche.is API 成功集成
- ✅ API 响应时间 < 2 秒
- ✅ 缓存命中率 >= 80%

### 数据质量管理
- ✅ 所有 POI 有 lastVerifiedAt
- ✅ 所有道路状态有 lastVerifiedAt
- ✅ Cron jobs 正常运行
- ✅ 数据新鲜度监控可用
- ✅ 过期数据自动更新

### 决策引擎集成
- ✅ Should-Exist Gate 检查 F-road 状态
- ✅ Should-Exist Gate 检查天气风险
- ✅ Should-Exist Gate 检查雪崩风险
- ✅ F-road 关闭 → BLOCK 或 ADJUST_REQUIRED
- ✅ 极端天气 → ADJUST_REQUIRED
- ✅ 雪崩危险 >= 4 → BLOCK

### 测试通过
- ✅ 单元测试覆盖率 >= 80%
- ✅ 集成测试通过
- ✅ E2E 测试通过（完整行程生成）
- ✅ 性能测试通过（1000 并发请求）

---

## 🎯 成功指标（KPI）

改造完成后，应达到：

1. **数据完整性**: 冰岛世界模型完成度 **78% → 95%+**
2. **数据新鲜度**: F-road 状态新鲜度 **0% → 95%+**（6 小时内）
3. **行程质量**: F-road 行程生成成功率 **50% → 90%+**
4. **用户满意度**: 冰岛行程用户满意度 **70% → 85%+**
5. **决策准确性**: Should-Exist Gate 准确率 **70% → 90%+**

---

## 📂 相关文档

- [专家评估报告](./ICELAND_WORLD_MODEL_EXPERT_ASSESSMENT.md)（本文档上方）
- [F-road 服务设施清单](./docs/iceland/data/F_ROAD_SERVICE_FACILITIES_CHECKLIST.md)
- [实时 API 集成方案](./docs/iceland/integration/REALTIME_API_INTEGRATION_PLAN.md)
- [Schema 改造方案](./docs/iceland/schema/LAST_VERIFIED_AT_SCHEMA_MIGRATION.md)
- [POI 分析脚本](./scripts/analyze-iceland-poi-coverage.ts)

---

## 🚀 开始执行

### Week 1 启动会议议程

1. 团队分工确认（30 分钟）
2. 技术方案评审（60 分钟）
3. 数据源接入确认（30 分钟）
4. 风险识别和缓解（30 分钟）
5. 下周交付目标确认（15 分钟）

### Week 1 交付目标

- [ ] POI 数据收集完成（加油站、小屋、至少 50+ 个）
- [ ] F-road 服务设施清单完成
- [ ] road.is API 测试通过
- [ ] Prisma Schema 改造完成

---

**最后更新**: 2026-02-13
**版本**: v1.0
**负责人**: TripNARA 技术负责人
**审核人**: CTO

✅ **执行清单已准备完毕，随时可以开始！**
