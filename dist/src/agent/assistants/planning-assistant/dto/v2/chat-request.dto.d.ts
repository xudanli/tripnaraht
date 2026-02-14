import { RequestContextDto } from '../planning-assistant.dto';
export declare class ChatOptionsDto {
    autoRoute?: boolean;
    clarifyIntent?: boolean;
    stream?: boolean;
}
export declare class ChatRequestDto {
    sessionId: string;
    userId?: string;
    message: string;
    language?: 'en' | 'zh';
    options?: ChatOptionsDto;
    context?: RequestContextDto;
}
