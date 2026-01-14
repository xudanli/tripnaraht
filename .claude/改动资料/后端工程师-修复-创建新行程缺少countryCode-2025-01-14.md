# 创建新行程缺少 countryCode 问题修复

**修复日期**: 2025-01-14  
**修复角色**: 后端工程师  
**问题**: 创建新行程时，`world.buildContext` 和 `decision.runThreeGuardians` 缺少必要参数

---

## 🔴 问题现象

从日志看：
```
[Nest] 8304  - 01/14/2026, 5:19:01 PM   ERROR [WorldBuildContextSkill] 构建 WorldModelContext 失败: countryCode 是必需的（可通过 tripId 或直接传入）
[Nest] 8304  - 01/14/2026, 5:19:01 PM   DEBUG [WorldBuildContextSkill] 执行 world.buildContext: tripId=none, countryCode=none
[Nest] 8304  - 01/14/2026, 5:19:02 PM   ERROR [DecisionRunThreeGuardiansSkill] 执行三人格策略失败: 必须提供 world 或 tripId
```

**用户消息**："帮我规划带娃去东京5天的行程，预算2万"

**问题**：
1. `world.buildContext` 需要 `countryCode`，但传入的是 `countryCode=none`
2. `decision.runThreeGuardians` 需要 `world` 或 `tripId`，但都没有提供
3. 系统没有从用户消息中提取 `countryCode`（"东京" -> "JP"）

---

## 🔍 问题分析

### 原因 1：城市名映射缺失

`extractCountryCodeFromMessage` 方法只支持国家名映射，不支持城市名映射：
- ✅ 支持："日本" -> "JP"
- ❌ 不支持："东京" -> "JP"

### 原因 2：提取逻辑可能未正确执行

虽然 `prepareSkillInput` 方法中有从用户消息提取 `countryCode` 的逻辑，但可能：
- 提取失败（因为城市名映射缺失）
- 提取逻辑执行顺序问题

---

## ✅ 修复方案

### 1. 扩展城市名映射

在 `extractCountryCodeFromMessage` 方法中添加城市名到国家代码的映射：

```typescript
const countryMap: Record<string, string> = {
  // 国家名
  '日本': 'JP',
  'Japan': 'JP',
  // 城市名映射到国家代码
  '东京': 'JP',
  'Tokyo': 'JP',
  '大阪': 'JP',
  'Osaka': 'JP',
  '京都': 'JP',
  'Kyoto': 'JP',
  // ... 更多城市
};
```

### 2. 优化提取逻辑

- 先尝试精确匹配（城市名优先，因为更具体）
- 如果精确匹配失败，再尝试不区分大小写匹配
- 添加调试日志，记录提取过程

---

## 🔧 已实施的修复

### 1. 扩展城市名映射

**文件**: `src/agent/services/claude-orchestrator.service.ts`

**添加的城市映射**：
- 日本城市：东京、大阪、京都、横滨、名古屋、福冈
- 中国城市：北京、上海
- 冰岛城市：雷克雅未克

### 2. 优化提取逻辑

**改进**：
- 先尝试精确匹配（包含中文字符的城市名）
- 再尝试不区分大小写匹配（英文城市名）
- 添加详细的调试日志

### 3. 代码示例

```typescript
private extractCountryCodeFromMessage(message: string): string | undefined {
  const countryMap: Record<string, string> = {
    // 国家名
    '日本': 'JP',
    'Japan': 'JP',
    // 城市名映射到国家代码
    '东京': 'JP',
    'Tokyo': 'JP',
    // ... 更多映射
  };
  
  // 先尝试精确匹配（城市名优先）
  for (const [key, code] of Object.entries(countryMap)) {
    if (message.includes(key)) {
      this.logger.debug(`从消息中提取国家代码: "${key}" -> ${code}`);
      return code;
    }
  }
  
  // 如果精确匹配失败，尝试不区分大小写匹配
  const lowerMessage = message.toLowerCase();
  for (const [key, code] of Object.entries(countryMap)) {
    if (lowerMessage.includes(key.toLowerCase())) {
      this.logger.debug(`从消息中提取国家代码（不区分大小写）: "${key}" -> ${code}`);
      return code;
    }
  }
  
  return undefined;
}
```

---

## ✅ 修复后的行为

### 场景 1：用户输入包含城市名

**用户消息**："帮我规划带娃去东京5天的行程，预算2万"

**行为**：
- ✅ `extractCountryCodeFromMessage` 检测到"东京"
- ✅ 返回 `countryCode = 'JP'`
- ✅ `world.buildContext` 收到 `countryCode: 'JP'`
- ✅ 成功构建 WorldModelContext

### 场景 2：用户输入包含国家名

**用户消息**："帮我规划去日本的行程"

**行为**：
- ✅ `extractCountryCodeFromMessage` 检测到"日本"
- ✅ 返回 `countryCode = 'JP'`
- ✅ 成功构建 WorldModelContext

### 场景 3：用户输入不包含目的地

**用户消息**："帮我规划行程"

**行为**：
- ⚠️ `extractCountryCodeFromMessage` 无法提取 `countryCode`
- ⚠️ `world.buildContext` 缺少 `countryCode`
- ✅ 系统应该返回澄清问题（需要用户提供目的地）

---

## 📋 测试建议

### 测试用例 1：城市名提取

**请求**：
```json
{
  "request_id": "test-001",
  "user_id": "user-123",
  "trip_id": null,
  "message": "帮我规划带娃去东京5天的行程，预算2万",
  "options": {
    "entry_point": "dashboard"
  }
}
```

**预期**：
- ✅ 从消息中提取 `countryCode = 'JP'`
- ✅ `world.buildContext` 成功执行
- ✅ `decision.runThreeGuardians` 收到 `world` 对象

### 测试用例 2：国家名提取

**请求**：
```json
{
  "message": "帮我规划去日本的行程"
}
```

**预期**：
- ✅ 从消息中提取 `countryCode = 'JP'`
- ✅ 成功构建 WorldModelContext

### 测试用例 3：无法提取目的地

**请求**：
```json
{
  "message": "帮我规划行程"
}
```

**预期**：
- ⚠️ 无法提取 `countryCode`
- ✅ 系统返回澄清问题（需要用户提供目的地）

---

## ✅ 修复状态

- ✅ 扩展了城市名映射
- ✅ 优化了提取逻辑
- ✅ 添加了调试日志
- ✅ 支持中英文城市名

---

## 📋 相关文件

- `src/agent/services/claude-orchestrator.service.ts` - 修复了 `extractCountryCodeFromMessage` 方法

---

**修复完成日期**: 2025-01-14  
**修复状态**: ✅ 已完成  
**下一步**: 测试验证修复效果
