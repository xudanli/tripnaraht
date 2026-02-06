# Amadeus API 凭证问题排查指南

## 🔍 诊断结果

根据诊断脚本的结果：

### ✅ 正常的部分
1. **环境变量设置正确** - 所有必要的环境变量都已设置
2. **凭证格式检查通过** - 没有明显的格式问题（空格、方括号等）
3. **MCP 连接配置正确** - 代码已正确实现配置传递

### ❌ 问题所在
**凭证验证失败** - 直接测试 Amadeus API 返回 `invalid_client` 错误

## 📋 问题分析

### 错误信息
```
错误代码: 38187
错误: invalid_client
错误描述: Client credentials are invalid
标题: Invalid parameters
```

### 可能的原因

1. **API 密钥激活延迟** ⏰
   - **新创建的 API 密钥可能需要等待 30 分钟才能激活**
   - 这是 Amadeus API 的正常行为
   - 如果刚刚创建了新的密钥，请等待一段时间后重试

2. **凭证不正确**
   - Client ID 或 Secret 输入错误
   - 复制粘贴时遗漏了字符
   - 凭证被修改过

3. **凭证已过期或被撤销**
   - 凭证在 Amadeus 开发者控制台被撤销
   - 凭证已过期（虽然 API Key 通常不会过期）

4. **环境不匹配**
   - 使用了生产环境的凭证测试测试 API
   - 或反之

5. **账户问题**
   - Amadeus 开发者账户状态异常
   - 应用被禁用或删除

## 🔧 解决步骤

### 步骤 1: 验证凭证来源

1. **访问 Amadeus 开发者控制台**
   - 打开 https://developers.amadeus.com/
   - 登录您的账户

2. **检查应用状态**
   - 进入 "My Self-Service Workspace"
   - 找到您的应用
   - 确认应用状态为 "Active"

3. **查看 API Key 和 Secret**
   - 点击应用查看详情
   - 确认显示的 API Key 与 `.env` 文件中的 `AMADEUS_CLIENT_ID` 完全一致
   - 点击眼睛图标查看完整的 API Secret
   - 确认与 `.env` 文件中的 `AMADEUS_CLIENT_SECRET` 完全一致

### 步骤 2: 重新生成凭证（如果需要）

如果凭证不匹配或不确定：

1. **删除旧凭证**
   - 在 Amadeus 控制台中删除现有的 API Key

2. **创建新凭证**
   - 点击 "Create new app" 或 "Generate new API Key"
   - 选择 "Test" 环境（不是 Production）
   - 复制新的 API Key 和 Secret

3. **更新 .env 文件**
   ```bash
   AMADEUS_CLIENT_ID=新的API_Key
   AMADEUS_CLIENT_SECRET=新的API_Secret
   AMADEUS_HOSTNAME=test
   ```

### 步骤 3: 等待 API 密钥激活（如果是新创建的）

如果刚刚创建了新的 API 密钥：

1. **等待激活**
   - Amadeus API 密钥通常需要 **30 分钟** 才能完全激活
   - 在此期间，即使凭证正确，也会返回 `invalid_client` 错误

2. **检查激活状态**
   - 可以定期运行诊断脚本检查：
     ```bash
     npx tsx scripts/diagnose-amadeus-credentials.ts
     ```
   - 或使用自动重试脚本：
     ```bash
     npx tsx scripts/test-amadeus-with-retry.ts
     ```

3. **如果超过 30 分钟仍然失败**
   - 检查凭证是否正确
   - 确认使用的是测试环境（不是生产环境）
   - 联系 Amadeus 支持（如果需要）

### 步骤 4: 验证凭证格式

确保 `.env` 文件中的凭证格式正确：

```bash
# ✅ 正确格式
AMADEUS_CLIENT_ID=pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe
AMADEUS_CLIENT_SECRET=G3UeGUiulAGEQA3J

# ❌ 错误格式（不要这样做）
AMADEUS_CLIENT_ID="pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe"  # 不要加引号
AMADEUS_CLIENT_ID=[pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe]  # 不要加方括号
AMADEUS_CLIENT_ID=pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe   # 不要有尾随空格
```

### 步骤 5: 重新测试

**如果刚刚创建了新的 API 密钥（等待激活）：**
```bash
# 使用自动重试脚本（每 5 分钟重试一次，最多 1 小时）
npm run test:amadeus:retry

# 或自定义重试间隔（例如每 10 分钟重试一次）
npx tsx scripts/test-amadeus-with-retry.ts --retry-delay 600
```

**如果密钥已创建超过 30 分钟：**
```bash
# 运行诊断脚本
npm run test:amadeus:diagnose

# 或运行搜索测试
npm run test:amadeus:search
```

## 📝 当前状态总结

| 项目 | 状态 | 说明 |
|------|------|------|
| 环境变量配置 | ✅ | 已正确设置 |
| 凭证格式 | ✅ | 格式正确 |
| MCP 连接代码 | ✅ | 配置传递已实现 |
| 凭证有效性 | ❌ | 凭证验证失败 |
| 配置传递 | ✅ | 已成功传递到服务器 |

## 💡 下一步

### 如果刚刚创建了新的 API 密钥

1. **等待激活（约 30 分钟）**
   - 使用自动重试脚本监控激活状态：
     ```bash
     npm run test:amadeus:retry
     ```
   - 脚本会自动每 5 分钟重试一次，最多 1 小时

2. **手动检查**
   - 等待 30 分钟后，运行诊断脚本：
     ```bash
     npm run test:amadeus:diagnose
     ```

### 如果密钥已创建超过 30 分钟

1. **检查 Amadeus 开发者控制台**，确认凭证是否正确
2. **如有需要，重新生成凭证**并更新 `.env` 文件
3. **重新运行测试**验证凭证是否有效

## 📝 快速参考

| 场景 | 命令 |
|------|------|
| 新创建的密钥（等待激活） | `npm run test:amadeus:retry` |
| 检查凭证状态 | `npm run test:amadeus:diagnose` |
| 测试航班搜索 | `npm run test:amadeus:search` |

一旦凭证激活，MCP 连接应该可以正常工作，因为代码层面的配置传递已经成功实现。
