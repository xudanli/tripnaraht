import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
export declare class SecurityMiddleware implements NestMiddleware {
    private readonly logger;
    private readonly attackPatterns;
    use(req: Request, res: Response, next: NextFunction): void;
    private detectThreat;
    private detectQueryThreat;
    private handleThreat;
}
