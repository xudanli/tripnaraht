import { HttpException } from '@nestjs/common';
export interface ErrorResponseDto {
    success: false;
    errorCode: string;
    message: string;
    messageCN: string;
    details?: Record<string, any>;
    traceId?: string;
    timestamp?: string;
}
export declare class SessionNotFoundException extends HttpException {
    constructor(sessionId: string);
}
export declare class SessionExpiredException extends HttpException {
    constructor(sessionId: string);
}
export declare class DestinationRequiredException extends HttpException {
    constructor();
}
export declare class PlanNotFoundException extends HttpException {
    constructor(planId: string);
}
export declare class InsufficientPlansException extends HttpException {
    constructor(provided: number);
}
export declare class PlanGenerationFailedException extends HttpException {
    constructor(details?: any, traceId?: string);
}
export declare class UnsupportedOptimizationTypeException extends HttpException {
    constructor(provided: string, supported: string[]);
}
export declare class TripNotFoundException extends HttpException {
    constructor(tripId: string);
}
export declare class TaskNotFoundException extends HttpException {
    constructor(taskId: string);
}
