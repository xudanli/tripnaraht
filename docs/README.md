# TripNARA RAG 文档中心

**欢迎来到 TripNARA RAG 技术文档中心**

---

## 🚀 快速导航

| 文档 | 说明 | 适用人群 |
|------|------|----------|
| **[RAG 快速参考](./RAG_QUICK_REFERENCE.md)** ⭐ | 5分钟上手，核心端点速查 | 开发人员 |
| **[RAG API 文档](./RAG_API_REFERENCE.md)** 📖 | 完整API接口参考 | 开发人员 |
| **[监控部署指南](./PROMETHEUS_MONITORING_GUIDE.md)** 📊 | Prometheus + Grafana | 运维人员 |
| **[RAG 架构总览](../README_RAG_ARCHITECTURE.md)** 🏗️ | 系统架构设计 | 所有人 |

---

## 📚 完整文档列表

### API 与开发

1. **[RAG API 完整参考](./RAG_API_REFERENCE.md)** (NEW ⭐)
   - RAG 核心接口
   - Gate 决策接口
   - 监控指标接口
   - 工具调用接口
   - 完整的请求/响应示例

2. **[RAG 快速参考](./RAG_QUICK_REFERENCE.md)** (NEW ⭐)
   - 常用端点速查
   - 代码示例（TypeScript/Python/cURL）
   - 错误码速查表

3. **[RAG 架构总览](../README_RAG_ARCHITECTURE.md)**
   - 5层降级策略
   - 决策优先架构
   - 核心概念

### 监控与运维

4. **[Prometheus 监控指南](./PROMETHEUS_MONITORING_GUIDE.md)** (NEW ⭐)
   - 15+ 监控指标详解
   - Grafana Dashboard 配置
   - Docker 一键部署
   - 告警规则建议

5. **[Phase 5.5 监控集成完成](./PHASE5.5_MONITORING_COMPLETE.md)** (NEW ⭐)
   - Prometheus 集成总结
   - 监控能力说明
   - 生产就绪度: 100%

### 测试与质量

6. **[单元测试执行报告](./UNIT_TEST_RESULTS.md)**
   - 99 个测试用例
   - 88.08% 覆盖率
   - 问题修复记录

7. **[Phase 5 测试完成总结](./PHASE5_TESTING_COMPLETE.md)**
   - Phase 5.1-5.4 完整总结
   - 集成验证报告
   - 生产就绪评估

8. **[Phase 5.3 单元测试](./RAG_PHASE5.3_UNIT_TESTING.md)**
   - 测试最佳实践
   - AAA 模式
   - Mock 策略

9. **[Phase 5.1 E2E 测试](./RAG_PHASE5.1_E2E_TESTING.md)**
   - 22 个 E2E 测试用例
   - Gate 决策测试
   - 证据验证

### 性能优化

10. **[Phase 5.2 性能优化](./RAG_PHASE5.2_PERFORMANCE_OPTIMIZATION.md)**
    - Redis 分布式缓存
    - 混合缓存策略
    - 错误重试机制
    - 并行执行优化

11. **[Phase 5 完整总结](./RAG_PHASE5_COMPLETE_SUMMARY.md)**
    - 所有 Phase 5 子阶段
    - 统计数据
    - 下一步建议

---

## 🎯 按场景浏览

### 场景 1: 我想快速了解 RAG API

👉 **推荐路径**:
1. [RAG 快速参考](./RAG_QUICK_REFERENCE.md) - 5分钟速览
2. [RAG API 文档](./RAG_API_REFERENCE.md) - 深入了解

### 场景 2: 我要部署监控系统

👉 **推荐路径**:
1. [Prometheus 监控指南](./PROMETHEUS_MONITORING_GUIDE.md) - 部署步骤
2. [Phase 5.5 监控集成](./PHASE5.5_MONITORING_COMPLETE.md) - 验证结果

### 场景 3: 我想了解测试覆盖情况

👉 **推荐路径**:
1. [单元测试执行报告](./UNIT_TEST_RESULTS.md) - 测试结果
2. [Phase 5 测试完成](./PHASE5_TESTING_COMPLETE.md) - 质量评估

### 场景 4: 我要优化系统性能

👉 **推荐路径**:
1. [Phase 5.2 性能优化](./RAG_PHASE5.2_PERFORMANCE_OPTIMIZATION.md) - 优化方案
2. [Prometheus 监控指南](./PROMETHEUS_MONITORING_GUIDE.md) - 监控指标

---

## 📊 项目状态一览

### 代码统计

```
生产代码:     6,230 行
单元测试:     1,550 行
E2E测试:      950 行
技术文档:     49,000+ 字
```

### 质量指标

```
✅ 单元测试覆盖率:   88.08%
✅ 单元测试用例:     99 个
✅ E2E 测试用例:     22 个
✅ 监控指标:         15+ 项
✅ Grafana 面板:     13 个
✅ 生产就绪度:       100%
```

### Phase 完成度

```
✅ Phase 1: 数据索引           100%
✅ Phase 2: 检索优化           100%
✅ Phase 3: 评估框架           100%
✅ Phase 4: 决策架构           100%
✅ Phase 5: 测试与优化         100%
   ├─ 5.1: E2E测试             100%
   ├─ 5.2: 性能优化            100%
   ├─ 5.3: 单元测试            100%
   ├─ 5.4: 集成验证            100%
   └─ 5.5: Prometheus监控      100% ⭐
```

---

## 🔧 快速开始

### 1. 启动应用

```bash
npm run start:dev
```

### 2. 测试 API

```bash
# 健康检查
curl http://localhost:3000/rag/metrics/stats

# RAG 检索
curl -X POST http://localhost:3000/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{"query":"冰岛天气"}'
```

### 3. 启动监控（可选）

```bash
cd monitoring
docker-compose up -d

# 访问 Grafana
open http://localhost:3001
```

---

## 💡 关键概念

### 5层降级策略

| Level | 名称 | 延迟 | 说明 |
|-------|------|------|------|
| 1️⃣ | VECTOR_RAG | ~50ms | 向量检索 |
| 2️⃣ | HYBRID_RAG | ~100ms | 混合检索 |
| 3️⃣ | KEYWORD_SEARCH | ~150ms | 关键词搜索 |
| 4️⃣ | WEB_BROWSE | ~2000ms | 实时网页 |
| 5️⃣ | GRACEFUL_FAILURE | ~10ms | 优雅降级 |

### Gate 决策结果

| 结果 | 含义 | 行动 |
|------|------|------|
| ✅ ALLOW | 允许 | 直接执行 |
| ⚠️ ADJUST_REQUIRED | 需调整 | 应用建议 |
| 🚫 BLOCK | 阻止 | 替代方案 |
| ❓ NEED_USER_CONFIRM | 需确认 | 等待确认 |

### 监控指标类别

1. **缓存指标** - 命中率、大小、延迟
2. **重试指标** - 成功率、平均重试次数
3. **并行指标** - 任务成功率、并发度
4. **API指标** - 调用延迟、错误率
5. **RAG指标** - 查询QPS、降级分布

---

## ❓ 常见问题

**Q: 如何查看 API 文档？**
A: 查看 [RAG API 文档](./RAG_API_REFERENCE.md)

**Q: 如何部署监控？**
A: 查看 [Prometheus 监控指南](./PROMETHEUS_MONITORING_GUIDE.md)

**Q: 测试覆盖率多少？**
A: 88.08%，详见 [单元测试报告](./UNIT_TEST_RESULTS.md)

**Q: 如何理解降级策略？**
A: 查看 [RAG 架构总览](../README_RAG_ARCHITECTURE.md)

**Q: 有性能优化建议吗？**
A: 查看 [Phase 5.2 性能优化](./RAG_PHASE5.2_PERFORMANCE_OPTIMIZATION.md)

**Q: 系统是否生产就绪？**
A: 是的，100% 就绪！详见 [Phase 5.5 完成总结](./PHASE5.5_MONITORING_COMPLETE.md)

---

## 📞 获取支持

- **GitHub Issues**: 报告问题
- **文档反馈**: Pull Request
- **邮件**: support@tripnara.com

---

## 📝 文档更新日志

### 2026-01-25 (最新)
- ✅ 新增 [RAG API 完整参考](./RAG_API_REFERENCE.md)
- ✅ 新增 [RAG 快速参考](./RAG_QUICK_REFERENCE.md)
- ✅ 完成 [Phase 5.5 监控集成](./PHASE5.5_MONITORING_COMPLETE.md)
- ✅ 完成 [Prometheus 监控指南](./PROMETHEUS_MONITORING_GUIDE.md)
- ✅ 创建本文档索引

---

**🎉 TripNARA RAG - 100% 生产就绪！**

**文档版本**: v1.0
**最后更新**: 2026-01-25
**维护者**: Claude Code
**项目状态**: ✅ 生产就绪
