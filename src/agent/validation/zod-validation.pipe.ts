// src/agent/validation/zod-validation.pipe.ts

/**
 * Zod Validation Pipe for NestJS
 *
 * 用途：
 * - 在 Controller/Handler 入口处拦截请求
 * - 使用 Zod schema 进行运行时校验
 * - 抛出标准化的 BadRequestException
 *
 * 使用示例：
 * ```typescript
 * @Post('/gate/evaluate')
 * async evaluateGate(
 *   @Body(new ZodValidationPipe(TripPlanRequestSchema)) request: TripPlanRequest
 * ) {
 *   // request 已通过 zod 校验
 * }
 * ```
 */

import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ZodType, ZodError } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodType) {}

  transform(value: unknown) {
    try {
      const parsedValue = this.schema.parse(value);
      return parsedValue;
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.issues.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        throw new BadRequestException({
          statusCode: 400,
          message: 'Validation failed',
          errors: formattedErrors,
        });
      }
      throw new BadRequestException('Validation failed');
    }
  }
}
