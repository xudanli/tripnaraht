import { ConfigService } from '@nestjs/config';
export declare class LlmExtractionService {
    private configService?;
    private readonly logger;
    private readonly openaiHttp;
    private readonly apiKey?;
    constructor(configService?: ConfigService);
    extractStructured<T>(prompt: string, schema: any): Promise<T>;
}
