export declare class ErrorResponseDto {
    success: boolean;
    errorCode: string;
    message: string;
    messageCN: string;
    details?: Record<string, any>;
    traceId?: string;
    timestamp?: string;
}
