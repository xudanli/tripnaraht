// src/agent/assistants/planning-assistant/exceptions/planning-assistant.exceptions.ts

/**
 * 规划助手智能体自定义异常
 * 
 * 参考文档:
 * - API_REDESIGN_ERROR_HANDLING.md - 错误处理规范
 */

import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorResponseDto {
  success: false;
  errorCode: string;
  message: string;
  messageCN: string;
  details?: Record<string, any>;
  traceId?: string;
  timestamp?: string;
}

/**
 * 会话不存在异常
 */
export class SessionNotFoundException extends HttpException {
  constructor(sessionId: string) {
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: '2001',
      message: 'Session not found',
      messageCN: '会话不存在',
      details: { sessionId },
      timestamp: new Date().toISOString(),
    };
    super(errorResponse, HttpStatus.NOT_FOUND);
  }
}

/**
 * 会话已过期异常
 */
export class SessionExpiredException extends HttpException {
  constructor(sessionId: string) {
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: '2002',
      message: 'Session expired',
      messageCN: '会话已过期',
      details: { sessionId },
      timestamp: new Date().toISOString(),
    };
    super(errorResponse, HttpStatus.GONE);
  }
}

/**
 * 目的地必填异常
 */
export class DestinationRequiredException extends HttpException {
  constructor() {
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: '3001',
      message: 'Destination is required',
      messageCN: '目的地必填',
      details: {
        field: 'destination',
        suggestion: 'Please provide a destination',
      },
      timestamp: new Date().toISOString(),
    };
    super(errorResponse, HttpStatus.BAD_REQUEST);
  }
}

/**
 * 方案不存在异常
 */
export class PlanNotFoundException extends HttpException {
  constructor(planId: string) {
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: '3002',
      message: 'Plan not found',
      messageCN: '方案不存在',
      details: { planId },
      timestamp: new Date().toISOString(),
    };
    super(errorResponse, HttpStatus.NOT_FOUND);
  }
}

/**
 * 方案数量不足异常（对比需要至少2个）
 */
export class InsufficientPlansException extends HttpException {
  constructor(provided: number) {
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: '3003',
      message: 'At least 2 plans are required for comparison',
      messageCN: '至少需要2个方案进行对比',
      details: {
        provided,
        required: 2,
      },
      timestamp: new Date().toISOString(),
    };
    super(errorResponse, HttpStatus.BAD_REQUEST);
  }
}

/**
 * 方案生成失败异常
 */
export class PlanGenerationFailedException extends HttpException {
  constructor(details?: any, traceId?: string) {
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: '3004',
      message: 'Plan generation failed',
      messageCN: '方案生成失败',
      details,
      traceId,
      timestamp: new Date().toISOString(),
    };
    super(errorResponse, HttpStatus.BAD_REQUEST);
  }
}

/**
 * 优化类型不支持异常
 */
export class UnsupportedOptimizationTypeException extends HttpException {
  constructor(provided: string, supported: string[]) {
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: '3005',
      message: 'Optimization type not supported',
      messageCN: '优化类型不支持',
      details: {
        provided,
        supported,
      },
      timestamp: new Date().toISOString(),
    };
    super(errorResponse, HttpStatus.BAD_REQUEST);
  }
}

/**
 * 行程不存在异常
 */
export class TripNotFoundException extends HttpException {
  constructor(tripId: string) {
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: '3006',
      message: 'Trip not found',
      messageCN: '行程不存在',
      details: { tripId },
      timestamp: new Date().toISOString(),
    };
    super(errorResponse, HttpStatus.NOT_FOUND);
  }
}

/**
 * 任务不存在异常
 */
export class TaskNotFoundException extends HttpException {
  constructor(taskId: string) {
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: '4001',
      message: 'Task not found',
      messageCN: '任务不存在',
      details: { taskId },
      timestamp: new Date().toISOString(),
    };
    super(errorResponse, HttpStatus.NOT_FOUND);
  }
}
