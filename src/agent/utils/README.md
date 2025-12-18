# Agent Utils

Agent 模块的工具类目录。

## 文件列表

### TokenCalculator

**文件**: `token-calculator.util.ts`

用于估算 LLM token 数量的工具类。

**使用方法**:
```typescript
import { TokenCalculator } from './utils/token-calculator.util';

// 估算文本 token
const tokens = TokenCalculator.estimateTokens('Hello 世界');

// 估算 JSON token
const jsonTokens = TokenCalculator.estimateJsonTokens({ key: 'value' });

// 估算消息数组 token
const messageTokens = TokenCalculator.estimateMessagesTokens([
  { role: 'user', content: 'Hello' }
]);

// 估算总 token
const totalTokens = TokenCalculator.estimateTotalTokens(
  requestText,
  responseText,
  additionalData
);
```

**估算规则**:
- 中文：1 token ≈ 1.5 字符
- 英文及其他：1 token ≈ 4 字符
- JSON/代码：基于序列化后的字符串估算

**测试**:
- 单元测试文件：`token-calculator.util.spec.ts`（需要 Jest 测试框架）

---

## 运行测试

如果需要运行测试，需要先配置 Jest：

```bash
# 安装测试依赖
npm install --save-dev jest @types/jest ts-jest

# 创建 jest.config.js
# 参考 NestJS 官方文档配置

# 运行测试
npm test
```

或者使用现有的测试脚本：
```bash
# 手动测试
npx ts-node --project tsconfig.backend.json scripts/test-agent.ts
```

