// src/agent/validation/README.md

# TripNARA 运行时输入校验 (Zod)

## 概述

本模块提供基于 Zod 的运行时输入校验，用于：
- **API 请求入参校验**：防止无效数据进入系统
- **Agent 输出校验**：确保 Agent 输出符合合同规范
- **Skills 输入/输出校验**：保证 Skills 之间的数据一致性
- **安全加固**：防止注入攻击、类型混淆等安全问题

## 安装

```bash
npm install zod
```

## 快速开始

### 1. Controller 入参校验

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { TripPlanRequestSchema } from './validation/trip-plan.schema';
import { ZodValidationPipe } from './validation/zod-validation.pipe';
import { TripPlanRequest } from './interfaces/trip-plan.interface';

@Controller('gate')
export class GateController {
  @Post('evaluate')
  async evaluateGate(
    @Body(new ZodValidationPipe(TripPlanRequestSchema)) request: TripPlanRequest
  ) {
    // request 已通过 zod 校验
    // 可以安全使用 request.origin, request.destination 等字段
    return this.gateService.evaluate(request);
  }
}
```

### 2. Service 输出校验

```typescript
import { GateResultSchema, validateGateResult } from './validation/trip-plan.schema';
import { GateResult } from './interfaces/trip-plan.interface';

class GatekeeperService {
  async evaluateGate(request: TripPlanRequest): Promise<GateResult> {
    const result: GateResult = {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 0.95,
    };

    // 校验输出
    const validation = validateGateResult(result);
    if (!validation.success) {
      throw new Error(`Invalid GateResult: ${validation.error.message}`);
    }

    return result;
  }
}
```

### 3. Skills 输入/输出校验

```typescript
import { TripPlanRequestSchema } from '../validation/trip-plan.schema';

class FRoadCheckSkill {
  async run(input: unknown) {
    // 校验输入
    const validation = TripPlanRequestSchema.safeParse(input);
    if (!validation.success) {
      throw new Error(`Invalid input: ${validation.error.message}`);
    }

    const request = validation.data;
    // 安全使用 request
  }
}
```

## 可用的 Schemas

### TripPlanRequestSchema
校验旅行计划请求，包括：
- `request_id`（必填）
- `origin`（字符串或坐标）
- `destination`（字符串或坐标）
- `date_range` 或 `start_date + days`
- `mode`（walk|drive|transit|mixed）
- `party`（人数、儿童、老人、体力水平）
- `constraints`（预算、时间窗口、无障碍要求等）
- `preferences`（风景优先、效率优先等）

**校验规则**：
- 纬度：-90 到 90
- 经度：-180 到 180
- 日期：ISO 8601 格式
- 时间窗口：HH:mm 格式
- 货币：3位 ISO 4217 代码

### GateResultSchema
校验门控评估结果，包括：
- `gate_result`（ALLOW|ADJUST_REQUIRED|BLOCK|NEED_USER_CONFIRM）
- `violations[]`（违规列表）
- `required_adjustments[]`（必要调整列表）
- `confidence`（0..1）
- `evidence_refs[]`（证据引用）

### EvidenceRefSchema
校验证据引用，包括：
- `evidence_id`（必填）
- `source`（必填）
- `confidence`（0..1）
- `last_verified_at`（ISO 8601）
- `url`（可选，必须是合法 URL）

### ItinerarySchema
校验行程计划，包括：
- `request_id`（必填）
- `days[]`（日程列表）
  - `date`（YYYY-MM-DD 格式）
  - `items[]`（行程条目）
    - `type`（TRANSIT|DRIVE|WALK|POI|REST|MEAL|ACCOMMODATION）
    - `start_window`, `end_window`
    - `location_ref`
    - `evidence_refs[]`
    - `verified`（boolean）

### DecisionLogEntrySchema
校验决策日志条目，包括：
- `request_id`, `step`, `actor`（必填）
- `inputs_summary`, `outputs_summary`（必填）
- `evidence_refs[]`
- `timestamp`（ISO 8601）
- `metadata`（允许额外字段）

## 错误处理

Zod 校验失败时，会抛出 `BadRequestException`：

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "path": "origin.lat",
      "message": "Latitude must be between -90 and 90",
      "code": "too_big"
    }
  ]
}
```

## 最佳实践

### 1. 在边界处校验
在系统边界（Controller、API Gateway、外部接口）校验输入：

```typescript
// ✅ Good: 在 Controller 入口校验
@Post('evaluate')
async evaluateGate(
  @Body(new ZodValidationPipe(TripPlanRequestSchema)) request: TripPlanRequest
) {
  return this.service.evaluate(request);
}

// ❌ Bad: 在 Service 深处才校验
class Service {
  evaluate(request: any) {
    // ... 大量逻辑
    const validation = TripPlanRequestSchema.safeParse(request); // 太晚了
  }
}
```

### 2. 校验 Agent 输出
Agent 输出应该被校验，确保符合合同：

```typescript
class GatekeeperAgent {
  async evaluateGate(request: TripPlanRequest): Promise<GateResult> {
    const result = await this.internalEvaluate(request);

    // 校验输出
    const validation = validateGateResult(result);
    if (!validation.success) {
      this.logger.error('Invalid GateResult', validation.error.errors);
      throw new Error('Agent produced invalid output');
    }

    return validation.data;
  }
}
```

### 3. 使用 TypeScript 类型推断
Zod 会自动推断 TypeScript 类型：

```typescript
import { z } from 'zod';
import { TripPlanRequestSchema } from './validation/trip-plan.schema';

// 自动获得类型
type TripPlanRequest = z.infer<typeof TripPlanRequestSchema>;
```

### 4. 部分校验
只校验需要的字段：

```typescript
// 只校验 request_id 和 origin
const PartialSchema = TripPlanRequestSchema.pick({
  request_id: true,
  origin: true,
});
```

### 5. 自定义错误消息
使用清晰的错误消息：

```typescript
z.string().min(1, 'Request ID is required')
z.number().min(0).max(1, 'Confidence must be between 0 and 1')
```

## 性能考虑

- **缓存 Schema**：不要在循环中重复创建 schema
- **早期失败**：在数据流的起点校验，避免浪费计算
- **异步校验**：Zod 支持异步校验（`.parseAsync()`），但通常同步即可

## 测试

运行校验测试：

```bash
npm test src/agent/validation/trip-plan.schema.spec.ts
```

测试覆盖：
- ✅ 正向用例（合法数据）
- ✅ 反向用例（非法数据）
- ✅ 边界值测试
- ✅ 错误消息验证

## 参考

- [Zod Documentation](https://zod.dev/)
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
- [TripNARA 数据合同](../interfaces/trip-plan.interface.ts)
