import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
export declare class EmailVerificationService {
    private prisma;
    private configService?;
    private readonly logger;
    private readonly transporter;
    private readonly codeExpirationMinutes;
    private readonly codeLength;
    constructor(prisma: PrismaService, configService?: ConfigService);
    private generateCode;
    private validateEmail;
    sendVerificationCode(email: string): Promise<void>;
    verifyCode(email: string, code: string): Promise<boolean>;
    cleanupExpiredCodes(): Promise<void>;
}
