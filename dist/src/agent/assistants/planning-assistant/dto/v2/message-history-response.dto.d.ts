export declare class MessageDto {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    intent?: string;
    data?: Record<string, any>;
}
export declare class MessageHistoryResponseDto {
    messages: MessageDto[];
    total: number;
    limit: number;
    offset: number;
}
