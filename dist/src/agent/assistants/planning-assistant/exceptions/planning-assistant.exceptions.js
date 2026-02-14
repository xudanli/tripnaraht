"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskNotFoundException = exports.TripNotFoundException = exports.UnsupportedOptimizationTypeException = exports.PlanGenerationFailedException = exports.InsufficientPlansException = exports.PlanNotFoundException = exports.DestinationRequiredException = exports.SessionExpiredException = exports.SessionNotFoundException = void 0;
const common_1 = require("@nestjs/common");
class SessionNotFoundException extends common_1.HttpException {
    constructor(sessionId) {
        const errorResponse = {
            success: false,
            errorCode: '2001',
            message: 'Session not found',
            messageCN: '会话不存在',
            details: { sessionId },
            timestamp: new Date().toISOString(),
        };
        super(errorResponse, common_1.HttpStatus.NOT_FOUND);
    }
}
exports.SessionNotFoundException = SessionNotFoundException;
class SessionExpiredException extends common_1.HttpException {
    constructor(sessionId) {
        const errorResponse = {
            success: false,
            errorCode: '2002',
            message: 'Session expired',
            messageCN: '会话已过期',
            details: { sessionId },
            timestamp: new Date().toISOString(),
        };
        super(errorResponse, common_1.HttpStatus.GONE);
    }
}
exports.SessionExpiredException = SessionExpiredException;
class DestinationRequiredException extends common_1.HttpException {
    constructor() {
        const errorResponse = {
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
        super(errorResponse, common_1.HttpStatus.BAD_REQUEST);
    }
}
exports.DestinationRequiredException = DestinationRequiredException;
class PlanNotFoundException extends common_1.HttpException {
    constructor(planId) {
        const errorResponse = {
            success: false,
            errorCode: '3002',
            message: 'Plan not found',
            messageCN: '方案不存在',
            details: { planId },
            timestamp: new Date().toISOString(),
        };
        super(errorResponse, common_1.HttpStatus.NOT_FOUND);
    }
}
exports.PlanNotFoundException = PlanNotFoundException;
class InsufficientPlansException extends common_1.HttpException {
    constructor(provided) {
        const errorResponse = {
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
        super(errorResponse, common_1.HttpStatus.BAD_REQUEST);
    }
}
exports.InsufficientPlansException = InsufficientPlansException;
class PlanGenerationFailedException extends common_1.HttpException {
    constructor(details, traceId) {
        const errorResponse = {
            success: false,
            errorCode: '3004',
            message: 'Plan generation failed',
            messageCN: '方案生成失败',
            details,
            traceId,
            timestamp: new Date().toISOString(),
        };
        super(errorResponse, common_1.HttpStatus.BAD_REQUEST);
    }
}
exports.PlanGenerationFailedException = PlanGenerationFailedException;
class UnsupportedOptimizationTypeException extends common_1.HttpException {
    constructor(provided, supported) {
        const errorResponse = {
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
        super(errorResponse, common_1.HttpStatus.BAD_REQUEST);
    }
}
exports.UnsupportedOptimizationTypeException = UnsupportedOptimizationTypeException;
class TripNotFoundException extends common_1.HttpException {
    constructor(tripId) {
        const errorResponse = {
            success: false,
            errorCode: '3006',
            message: 'Trip not found',
            messageCN: '行程不存在',
            details: { tripId },
            timestamp: new Date().toISOString(),
        };
        super(errorResponse, common_1.HttpStatus.NOT_FOUND);
    }
}
exports.TripNotFoundException = TripNotFoundException;
class TaskNotFoundException extends common_1.HttpException {
    constructor(taskId) {
        const errorResponse = {
            success: false,
            errorCode: '4001',
            message: 'Task not found',
            messageCN: '任务不存在',
            details: { taskId },
            timestamp: new Date().toISOString(),
        };
        super(errorResponse, common_1.HttpStatus.NOT_FOUND);
    }
}
exports.TaskNotFoundException = TaskNotFoundException;
//# sourceMappingURL=planning-assistant.exceptions.js.map