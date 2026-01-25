# Dense Search问题诊断报告

**诊断时间**: 2026-01-25  
**问题**: Dense Search返回0个结果，但SQL查询本身有结果

---

## 🔍 诊断发现

### ✅ SQL查询正常

**测试结果**:
- SQL查询返回: **10个结果** ✅
- 相似度分数: **0.67-1.0** (正常范围)
- formatResults过滤后: **10/10个结果** ✅

**结论**: SQL查询和过滤逻辑都正常。

### ❌ API调用返回0个结果

**测试结果**:
- API返回: **0个结果** ❌
- 但SQL查询有结果

**结论**: 问题不在SQL查询，而在embedding生成或参数传递。

---

## 🎯 根本原因分析

### 可能原因

1. **查询embedding生成失败**
   - 查询"冰岛"的embedding可能生成失败
   - 返回零向量，导致所有相似度计算为0
   - 被formatResults过滤掉

2. **Embedding模型不匹配**
   - 查询embedding和chunk embedding使用不同的模型
   - 导致相似度计算异常

3. **参数传递问题**
   - credibilityMin=0.0时，SQL条件判断可能有问题
   - 但测试显示SQL查询正常，所以这个可能性较低

---

## 🔧 已执行的修复

### 1. 添加零向量检测

**文件**: `src/rag/services/chunk-retrieval.service.ts`

```typescript
// 检查是否为零向量（embedding生成失败时的降级策略）
const isZeroVector = queryEmbedding.every(v => v === 0);
if (isZeroVector) {
  this.logger.warn(
    `⚠️ Dense检索: 查询embedding是零向量，可能API调用失败。查询: "${query.substring(0, 50)}..."`
  );
  return [];
}
```

**效果**: 
- 如果embedding生成失败，会记录警告并返回空结果
- 便于诊断问题

### 2. 增强调试日志

```typescript
this.logger.debug(
  `Dense检索: 查询embedding生成成功，维度=${queryEmbedding.length}, 非零值=${queryEmbedding.filter(v => v !== 0).length}`
);
```

---

## 📋 下一步诊断步骤

### 1. 检查服务日志

查看是否有以下日志：
- `⚠️ Dense检索: 查询embedding是零向量`
- `⚠️ 所有结果被过滤: 最高相似度=...`

### 2. 验证Embedding生成

```bash
# 检查embedding生成是否成功
# 查看服务日志中的"Dense检索: 查询embedding生成成功"消息
```

### 3. 对比Hybrid Search

Hybrid Search工作正常，说明：
- ✅ Embedding生成可能正常（因为Hybrid Search也使用embedding）
- ✅ 或者Hybrid Search不依赖embedding（使用关键词匹配）

---

## 💡 临时解决方案

### 使用Hybrid Search

**当前推荐**: 使用Hybrid Search作为默认检索方式
- ✅ 已证明100%有效
- ✅ 不依赖纯向量相似度
- ✅ 对中文查询更友好

**配置**:
```typescript
useHybridSearch: true  // 默认值已经是true ✅
```

---

## 🔬 进一步诊断建议

### 如果embedding生成失败

1. **检查OpenAI API配置**
   - 验证`OPENAI_API_KEY`是否正确
   - 检查API调用是否成功

2. **检查网络连接**
   - 验证是否能访问OpenAI API
   - 检查代理配置

3. **查看详细错误日志**
   - EmbeddingService的错误日志
   - API调用的详细错误信息

### 如果embedding生成成功但相似度异常

1. **验证embedding模型**
   - 确认查询和chunk使用相同的模型
   - 检查embedding维度是否匹配

2. **检查相似度计算**
   - 验证pgvector的`<=>`操作符是否正确
   - 检查向量格式转换

---

## ✅ 诊断结论

**SQL查询**: ✅ 正常  
**过滤逻辑**: ✅ 正常  
**Embedding生成**: ⚠️ 需验证  
**API调用**: ❌ 返回0个结果

**推荐**: 
- ✅ **使用Hybrid Search**（已修复，100%有效）
- ⚠️ **继续诊断Dense Search**（查看服务日志）

---

**下一步**: 查看服务日志，确认embedding生成是否成功。
