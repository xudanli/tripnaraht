# RAG 架构部署检查清单
**TripNARA 决策优先架构 - 上线前检查**

---

## ✅ 部署前检查清单

### Phase 1: 代码完成度检查 ✅ (已完成)

- [x] **RagFallbackService** - 5层降级策略服务
  - [x] Level 1-5 降级逻辑实现
  - [x] 知识缺口记录功能
  - [x] 官方链接后备方案
  - [x] 完整日志记录

- [x] **GateDecisionLoggerService** - Gate 决策日志服务
  - [x] 决策日志结构定义
  - [x] 证据引用创建工具
  - [x] 工作流步骤记录
  - [x] 查询接口定义

- [x] **RagFreshnessService** - 数据新鲜度服务
  - [x] 分级新鲜度规则
  - [x] 自动验证触发
  - [x] 降级策略（验证失败）
  - [x] 统计接口

- [x] **RAGEvaluationService** - Gate 评估扩展
  - [x] evaluateGateAccuracy()
  - [x] evaluateEvidenceCoverage()
  - [x] evaluateAlternativesQuality()

- [x] **RAG Module** - 模块集成
  - [x] 服务注册到 providers
  - [x] 服务导出到 exports
  - [x] 模块文档更新

---

### Phase 2: 数据库迁移 ⏳ (待执行)

#### 2.1 SQL 迁移文件准备

- [x] `add_decision_logs_and_knowledge_gaps.sql` 已创建
  - [x] decision_logs 表定义
  - [x] knowledge_gaps 表定义
  - [x] chunks 表扩展（category, last_verified_at）
  - [x] 索引优化
  - [x] 统计视图创建

#### 2.2 执行迁移

```bash
# 检查数据库连接
psql -U your_username -d tripnara_db -c "SELECT version();"

# 备份数据库（重要！）
pg_dump -U your_username -d tripnara_db > backup_$(date +%Y%m%d).sql

# 执行迁移
psql -U your_username -d tripnara_db -f prisma/migrations/add_decision_logs_and_knowledge_gaps.sql

# 验证迁移成功
psql -U your_username -d tripnara_db -c "SELECT * FROM v_gate_decision_stats LIMIT 1;"
psql -U your_username -d tripnara_db -c "SELECT * FROM v_knowledge_gap_stats;"
psql -U your_username -d tripnara_db -c "SELECT * FROM v_chunks_freshness_stats;"
```

**检查点**:
- [ ] decision_logs 表创建成功
- [ ] knowledge_gaps 表创建成功
- [ ] chunks.category 字段添加成功
- [ ] chunks.last_verified_at 字段添加成功
- [ ] 所有索引创建成功
- [ ] 统计视图可查询

#### 2.3 Prisma Schema 更新

```bash
# 将 prisma/schema-extensions-rag.prisma 中的模型定义
# 复制到 prisma/schema.prisma

# 重新生成 Prisma Client
npx prisma generate

# 验证类型定义
npm run typecheck
```

**检查点**:
- [ ] DecisionLog 模型可用
- [ ] KnowledgeGap 模型可用
- [ ] Chunk 模型包含新字段
- [ ] 类型检查通过

---

### Phase 3: 依赖集成 ⏳ (待执行)

#### 3.1 MCP Skills Server 集成

**Web Browse Skill** (用于 Level 4 降级):

```bash
# 安装 MCP SDK
npm install @modelcontextprotocol/sdk

# 创建 MCP Client Service
# src/skills/mcp-client.service.ts (参考 RAG_IMPLEMENTATION_GUIDE.md)
```

**检查点**:
- [ ] MCP Client Service 创建
- [ ] Web Browse Skill 可调用
- [ ] RagFallbackService 集成 Web Browse

#### 3.2 Google Places API 集成

**POI 开放时间验证**:

```bash
# 添加环境变量
echo "GOOGLE_PLACES_API_KEY=your_api_key" >> .env

# 创建 Google Places Service
# src/skills/google-places.service.ts (参考 RAG_IMPLEMENTATION_GUIDE.md)
```

**检查点**:
- [ ] Google Places Service 创建
- [ ] API KEY 配置完成
- [ ] RagFreshnessService 集成 Google Places

#### 3.3 实时天气/路况 API 集成

**Gate 决策数据源**:

```bash
# 添加环境变量
echo "WEATHER_API_KEY=your_api_key" >> .env
echo "ROAD_STATUS_API_URL=https://api.road.is" >> .env
```

**检查点**:
- [ ] Weather Service 创建
- [ ] Road Status Service 创建
- [ ] API 可正常调用

---

### Phase 4: 测试与验证 ⏳ (待执行)

#### 4.1 单元测试

```bash
# 运行服务测试
npm test -- rag-fallback.service
npm test -- gate-decision-logger.service
npm test -- rag-freshness.service
npm test -- rag-evaluation.service
```

**检查点**:
- [ ] RagFallbackService 测试通过
- [ ] GateDecisionLoggerService 测试通过
- [ ] RagFreshnessService 测试通过
- [ ] RAGEvaluationService 测试通过

#### 4.2 集成测试

```bash
# 运行示例脚本
npx tsx scripts/example-rag-usage.ts

# 预期: 所有示例正常执行
```

**检查点**:
- [ ] 示例 1 (规则查询) 通过
- [ ] 示例 2 (Gate 决策) 通过
- [ ] 示例 3 (新鲜度检查) 通过
- [ ] 示例 4 (Gate 评估) 通过
- [ ] 示例 5 (证据覆盖率) 通过

#### 4.3 Gate 测试集评估

```bash
# 创建测试集 (e2e-cases/gate-test-cases.json)
# 运行评估
npx tsx scripts/evaluate-gate-quality.ts
```

**目标指标**:
- [ ] Gate Accuracy >= 98%
- [ ] Avg Confidence >= 0.85
- [ ] Evidence Coverage >= 95%
- [ ] Alternatives Coverage >= 80%

---

### Phase 5: 性能优化 ⏳ (可选)

#### 5.1 并行化 Tools 调用

```typescript
// Gate 决策中并行调用
const [weather, road, dem] = await Promise.all([
  weatherService.getForecast(...),
  roadStatusService.getClosures(...),
  demService.getProfile(...),
]);
```

**目标**: Gate 决策延迟 < 2s (P95)

#### 5.2 Redis 缓存热点查询

```bash
# 添加 Redis 配置
echo "REDIS_HOST=localhost" >> .env
echo "REDIS_PORT=6379" >> .env
```

**缓存策略**:
- RULES 查询: TTL = 7 天
- POI 查询: TTL = 1 天
- GATE 查询: TTL = 1 小时

#### 5.3 监控与告警

```bash
# 添加监控指标
- RAG 降级率 (目标 < 5%)
- Gate 决策延迟 (目标 < 2s)
- 数据新鲜度 (目标 > 90% fresh)
- 证据覆盖率 (目标 > 95%)
```

---

### Phase 6: 文档完整性检查 ✅ (已完成)

- [x] **架构评估报告** - RAG_ARCHITECTURE_EVALUATION.md
- [x] **实施指南** - RAG_IMPLEMENTATION_GUIDE.md
- [x] **快速开始** - RAG_QUICK_START.md
- [x] **部署检查清单** - 本文档
- [x] **向量化报告** - VECTOR_EMBEDDING_SUCCESS.md

---

## 🚀 部署顺序（推荐）

### Week 1: 基础设施

**Day 1-2**: 数据库迁移
```bash
1. 备份数据库 ✓
2. 执行 SQL 迁移 ⏳
3. 更新 Prisma Schema ⏳
4. 验证表结构 ⏳
```

**Day 3-4**: MCP Skills 集成
```bash
1. 安装 MCP SDK ⏳
2. 创建 MCP Client Service ⏳
3. 集成 Web Browse Skill ⏳
4. 测试 Web Browse ⏳
```

**Day 5**: Google Places 集成
```bash
1. 创建 Google Places Service ⏳
2. 集成到 RagFreshnessService ⏳
3. 测试 POI 新鲜度验证 ⏳
```

### Week 2: 测试与优化

**Day 1-2**: 单元测试
```bash
1. 编写服务测试 ⏳
2. 运行测试并修复 ⏳
3. 达到 80% 覆盖率 ⏳
```

**Day 3-4**: 集成测试
```bash
1. 创建 Gate 测试集 ⏳
2. 运行评估并调优 ⏳
3. 达到目标指标 ⏳
```

**Day 5**: 性能优化
```bash
1. 实现 Tools 并行调用 ⏳
2. 添加 Redis 缓存 ⏳
3. 性能测试并调优 ⏳
```

### Week 3: 上线与监控

**Day 1-2**: 灰度发布
```bash
1. 10% 流量灰度 ⏳
2. 监控错误率和延迟 ⏳
3. 收集用户反馈 ⏳
```

**Day 3-4**: 全量发布
```bash
1. 100% 流量切换 ⏳
2. 持续监控 24h ⏳
3. 调优降级阈值 ⏳
```

**Day 5**: 总结与改进
```bash
1. 生成质量报告 ⏳
2. 分析知识缺口 ⏳
3. 规划下阶段优化 ⏳
```

---

## 📊 关键指标 (KPI)

### 服务可用性

| 指标 | 目标 | 当前 | 状态 |
|------|------|------|------|
| RAG 检索成功率 | >= 99.9% | - | ⏳ |
| Gate 决策延迟 (P95) | < 2s | - | ⏳ |
| 降级到 Graceful Failure 率 | < 1% | - | ⏳ |

### 决策质量

| 指标 | 目标 | 当前 | 状态 |
|------|------|------|------|
| Gate Accuracy | >= 98% | - | ⏳ |
| Evidence Coverage | >= 95% | - | ⏳ |
| Alternatives Coverage | >= 80% | - | ⏳ |

### 数据质量

| 指标 | 目标 | 当前 | 状态 |
|------|------|------|------|
| 数据新鲜度 (RULES) | >= 90% | - | ⏳ |
| 数据新鲜度 (POI_HOURS) | >= 85% | - | ⏳ |
| 知识缺口处理率 | >= 80% | - | ⏳ |

---

## 🎯 验收标准

### 必须满足（P0）

- [ ] 所有 P0 服务代码通过 review
- [ ] 数据库迁移成功执行
- [ ] Prisma Schema 更新完成
- [ ] 单元测试覆盖率 >= 80%
- [ ] 集成测试全部通过
- [ ] Gate Accuracy >= 98%
- [ ] 文档完整且可执行

### 推荐满足（P1）

- [ ] MCP Skills 集成完成
- [ ] Google Places 集成完成
- [ ] Tools 并行调用实现
- [ ] Redis 缓存配置完成
- [ ] 监控告警配置完成

### 可选满足（P2）

- [ ] 多模态 RAG 实现
- [ ] Graph RAG 增强
- [ ] 个性化权重调整

---

## 🆘 回滚计划

### 如果出现严重问题

**数据库回滚**:
```bash
# 1. 停止应用
pm2 stop tripnara

# 2. 恢复数据库备份
psql -U your_username -d tripnara_db < backup_$(date +%Y%m%d).sql

# 3. 回退代码版本
git revert <commit_hash>

# 4. 重新部署
npm run build
pm2 restart tripnara
```

**服务降级**:
```typescript
// 临时禁用新服务，使用旧版 RagService
// 修改 rag.module.ts:
providers: [
  // RagFallbackService, // 注释掉
  // GateDecisionLoggerService, // 注释掉
  // RagFreshnessService, // 注释掉
  RagService, // 使用旧版
]
```

---

## 📞 联系人

**技术负责人**: [填写]
**数据库管理**: [填写]
**运维支持**: [填写]

---

**创建时间**: 2026-01-24
**最后更新**: 2026-01-24
**当前阶段**: Phase 1 完成，进入 Phase 2
**预计上线**: Week 3
