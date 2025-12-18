# Agent 模块测试指南

## 概述

Agent 模块已配置 Jest 测试框架，支持单元测试和集成测试。

✅ **状态**：Jest 依赖已安装，测试框架已配置完成。

## 安装依赖

Jest 依赖已安装。如果遇到权限问题，可以使用：

```bash
npm install --save-dev jest @types/jest ts-jest @nestjs/testing --ignore-scripts
```

## 运行测试

```bash
# 运行所有测试
npm test

# 运行 Agent 模块的测试
npm run test:agent

# 以监视模式运行
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## 测试文件结构

```
src/agent/
├── services/
│   ├── router.service.ts
│   ├── router.service.spec.ts          # Router 单元测试
│   ├── orchestrator.service.ts
│   ├── orchestrator.service.spec.ts    # Orchestrator 单元测试
│   └── critic.service.ts
│   └── critic.service.spec.ts          # Critic 单元测试
└── utils/
    ├── token-calculator.util.ts
    └── token-calculator.util.spec.ts   # TokenCalculator 单元测试
```

## 编写测试

### 基本测试结构

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { YourService } from './your.service';

describe('YourService', () => {
  let service: YourService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YourService,
        // Mock 依赖服务
        {
          provide: DependencyService,
          useValue: {
            // Mock 方法
          },
        },
      ],
    }).compile();

    service = module.get<YourService>(YourService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('方法名', () => {
    it('应该执行某个操作', async () => {
      // 测试逻辑
    });
  });
});
```

## 注意事项

1. **类型错误**：如果看到 Jest 类型相关的错误，确保已安装 `@types/jest`
2. **Mock 服务**：使用 `@nestjs/testing` 的 `Test.createTestingModule` 来创建测试模块
3. **异步测试**：使用 `async/await` 处理异步操作
4. **覆盖率**：目标是至少 70% 的代码覆盖率

## 当前测试状态

- ✅ RouterService 单元测试（基础）
- ✅ OrchestratorService 单元测试（完整）
  - 基础执行测试
  - 超时处理测试
  - 并行执行测试
  - 错误处理测试
  - 前置条件检查测试
- ✅ CriticService 单元测试（基础）
- ✅ TokenCalculator 工具测试（完整）
- ✅ AgentService 集成测试（完整）
  - SYSTEM1_API 路由测试
  - SYSTEM2_WEBBROWSE 路由测试（有授权/无授权）
- ⏳ E2E 测试（待补充）

## 下一步

1. ✅ 添加更多单元测试覆盖边界情况（已完成）
2. ✅ 实现集成测试（完整流程）（已完成）
3. ⏳ 实现 E2E 测试（真实场景）
4. ⏳ 提高测试覆盖率至 80%+

