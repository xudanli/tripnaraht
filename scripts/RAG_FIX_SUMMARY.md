# RAG检索问题修复总结

**修复时间**: 2026-01-25  
**修复人**: 首席AI科学家  
**问题**: Dense检索返回0个结果，Hybrid检索效果有限

---

## 🔧 已执行的修复

### 1. 降低相似度阈值（动态阈值）

**文件**: `src/rag/services/chunk-retrieval.service.ts`

**修改前**:
```typescript
const similarityThreshold = 0.01; // 固定阈值
```

**修改后**:
```typescript
// 动态阈值：如果credibilityMin很低（如0.0），则使用更低的similarity阈值
const similarityThreshold = credibilityMin <= 0.0 ? 0.001 : 0.01;
```

**效果**: 
- 当credibilityMin=0.0时，similarityThreshold=0.001（降低10倍）
- 允许更多低相似度但高可信度的结果通过

### 2. 优化Hybrid Search过滤逻辑

**文件**: `src/rag/services/chunk-retrieval.service.ts`

**修改前**:
```typescript
const filteredResults = mergedResults.filter((r) => {
  const score = r.hybridScore || r.similarity || 0;
  return score > 0; // 只检查分数>0
});
```

**修改后**:
```typescript
const filteredResults = mergedResults.filter((r) => {
  const score = r.hybridScore || r.similarity || 0;
  const credibility = r.credibilityScore || 0;
  // Hybrid Search: 只要分数>0且credibility满足要求即可
  return score > 0 && credibility >= (params.credibilityMin || 0);
});
```

**效果**: 
- 确保credibility过滤也应用于Hybrid Search结果
- 保持过滤逻辑一致性

### 3. 增强诊断日志

**文件**: `src/rag/services/chunk-retrieval.service.ts`

**新增日志**:
```typescript
// 详细日志：记录过滤前后的结果数
const beforeFilter = results.length;
const afterFilter = formattedResults.length;
this.logger.debug(
  `检索完成: 原始结果=${beforeFilter}, 过滤后=${afterFilter}, ` +
  `阈值=${similarityThreshold}, credibilityMin=${credibilityMin}`
);

// 如果过滤后结果为空但原始结果不为空，记录警告
if (beforeFilter > 0 && afterFilter === 0) {
  const maxSim = Math.max(...results.map(r => parseFloat(String(r.similarity))));
  const minSim = Math.min(...results.map(r => parseFloat(String(r.similarity))));
  this.logger.warn(
    `⚠️ 所有结果被过滤: 最高相似度=${maxSim.toFixed(4)}, ` +
    `最低相似度=${minSim.toFixed(4)}, 阈值=${similarityThreshold}`
  );
}
```

**效果**: 
- 便于诊断为什么结果被过滤
- 可以看到实际的相似度分数分布

### 4. 更新API文档

**文件**: `src/rag/rag.controller.ts`

**修改**: 更新API文档，说明Hybrid Search对中文查询更有效

---

## 📋 修复后的预期效果

### Dense检索
- **之前**: 所有查询返回0个结果
- **预期**: 至少部分查询能返回结果（相似度>=0.001）

### Hybrid检索
- **之前**: 仅1/5查询有结果
- **预期**: 更多查询能返回结果（结合关键词匹配）

### 诊断能力
- **之前**: 无法知道为什么结果被过滤
- **预期**: 通过日志可以看到相似度分数分布和过滤原因

---

## ⚠️ 重要提醒

### 必须重启服务

**代码修改需要重启NestJS服务才能生效！**

```bash
# 重启服务（根据你的部署方式选择）
pm2 restart tripnara
# 或
systemctl restart tripnara
# 或直接重启Node进程
```

### 验证修复

重启后运行验证脚本：

```bash
npx tsx scripts/rag-data-validation.ts
npx tsx scripts/test-iceland-rag.ts
```

---

## 🔍 如果修复后仍无结果

### 进一步诊断步骤

1. **检查服务日志**
   ```bash
   # 查看是否有警告日志
   tail -f logs/app.log | grep "所有结果被过滤"
   ```

2. **检查实际相似度分数**
   - 查看日志中的"最高相似度"和"最低相似度"
   - 如果最高相似度<0.001，说明embedding生成可能有问题

3. **进一步降低阈值**
   - 如果最高相似度在0.0001-0.001之间，可以进一步降低阈值到0.0001
   - 或者完全移除similarity阈值，只使用credibility过滤

4. **验证Embedding生成**
   - 确认查询embedding和chunk embedding使用相同的模型
   - 验证embedding模型对中文的支持

---

## 📊 修复前后对比

| 指标 | 修复前 | 修复后（预期） |
|------|--------|---------------|
| Dense检索成功率 | 0% (0/5) | >= 40% (2/5) |
| Hybrid检索成功率 | 20% (1/5) | >= 60% (3/5) |
| 平均结果数 | 0.2 | >= 2 |
| 诊断能力 | 无 | 有详细日志 |

---

## ✅ 修复验证清单

- [x] 降低similarityThreshold（动态阈值）
- [x] 优化Hybrid Search过滤逻辑
- [x] 增强诊断日志
- [x] 更新API文档
- [ ] **待执行**: 重启NestJS服务
- [ ] **待执行**: 运行验证脚本
- [ ] **待执行**: 确认修复效果

---

**下一步**: 重启服务并验证修复效果！
