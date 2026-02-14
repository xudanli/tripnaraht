import { Response } from 'express';
export declare class McpOAuthController {
    private readonly logger;
    callback(code: string, state: string, error: string, errorDescription: string, res: Response): Promise<Response<any, Record<string, any>>>;
}
