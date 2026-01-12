# Claude 编排调试指南

## 🔍 当前问题分析

从测试结果看：

### ✅ 成功的部分

1. **Claude 编排被触发** ✅
   - 路由决策：`SYSTEM2_REASONING`
   - 决策原因：`LLM_DECISION`
   - 响应时间：121ms（很快，可能使用了降级方案）

2. **代码流程正常** ✅
   - 意图分析完成
   - 路由决策完成

### ⚠️ 失败的部分

1. **执行步骤失败** ❌
   - 消息："处理完成，但所有步骤都失败了"
   - 决策日志为空：`decision_log: []`
   - 无工具调用：`tool_calls: 0`

## 🔍 可能的原因

### 1. Skills 选择失败

如果 `selectSkills` 失败，会返回空数组，导致执行计划为空。

**检查方法**：
查看服务日志中是否有：
```
[Claude Orchestrator] Skills 选择失败: ...
[Claude Orchestrator] ✅ Skills 选择完成: 0 个 Skills
```

### 2. 执行计划为空

如果 Skills 选择返回空数组，执行计划也会为空，导致没有步骤执行。

**检查方法**：
查看服务日志中是否有：
```
[Claude Orchestrator] ✅ 执行计划完成: 0 个步骤
```

### 3. API 调用失败但使用了降级方案

如果 Claude API 调用失败，代码会使用降级方案（默认值），这可能导致：
- 意图分析使用默认值
- 路由决策使用默认值
- Skills 选择返回空数组

**检查方法**：
查看服务日志中是否有：
```
[Claude Orchestrator] 意图分析失败，使用默认值: ...
[Claude Orchestrator] 路由决策失败，使用默认值: ...
[Claude Orchestrator] Skills 选择失败: ...
```

## 🧪 调试步骤

### 1. 查看服务日志

如果服务在终端运行，查看终端输出。如果使用 Docker，查看容器日志：

```bash
# 查看最近的日志
docker logs tripnara-app --tail 100

# 过滤 Claude 相关日志
docker logs tripnara-app --tail 200 | grep -i "claude\|anthropic"
```

### 2. 启用详细日志

在 `.env` 文件中添加：

```bash
LOG_LEVEL=error,warn,log,debug
```

然后重启服务。

### 3. 测试代理服务

直接测试代理服务是否正常工作：

```bash
curl -X POST https://hongmacode.com/api/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-haiku-20240307",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### 4. 检查环境变量

确认服务加载了正确的环境变量：

```bash
# 如果使用 Docker
docker exec tripnara-app printenv | grep ANTHROPIC

# 如果直接运行
# 查看运行服务的终端，确认环境变量已加载
```

## 🔧 可能的修复

### 修复 1: 确保服务重启

修改 `.env` 后，必须重启服务：

```bash
# 停止服务（Ctrl+C）
# 重新启动
npm run dev
```

### 修复 2: 检查 Skills 选择逻辑

如果 Skills 选择总是返回空数组，可能需要：
1. 检查 `getAvailableSkills()` 是否返回了 Skills
2. 检查 Claude API 调用是否成功
3. 检查 Skills 选择的 prompt 是否正确

### 修复 3: 增强错误处理

在 `selectSkills` 失败时，可以：
1. 记录详细的错误信息
2. 返回一个默认的 Skills（如果可能）
3. 提供更清晰的错误消息

## 📋 检查清单

- [ ] 服务已重启（加载了新的环境变量）
- [ ] `ANTHROPIC_BASE_URL` 已正确配置
- [ ] `ANTHROPIC_MODEL` 已设置为支持的模型（`claude-3-haiku-20240307`）
- [ ] 代理服务可访问（curl 测试成功）
- [ ] 服务日志中显示了 API 调用
- [ ] Skills 选择返回了 Skills（不是空数组）

## 🚀 下一步

1. **查看服务日志**：确认具体的错误信息
2. **验证代理服务**：确保代理服务正常工作
3. **检查 Skills 注册**：确认有可用的 Skills
4. **测试完整流程**：从意图分析到执行

---

**最后更新**: 2024-01-12  
**状态**: 🔍 需要查看详细日志定位问题
