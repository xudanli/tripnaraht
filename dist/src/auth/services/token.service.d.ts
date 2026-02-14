import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
export declare class TokenService {
    private jwtService;
    private prisma;
    private configService?;
    private readonly logger;
    private readonly accessTokenExpiresIn;
    private readonly refreshTokenExpiresInDays;
    constructor(jwtService: JwtService, prisma: PrismaService, configService?: ConfigService);
    issueAccessToken(userId: string, email?: string): Promise<string>;
    issueRefreshToken(userId: string): Promise<{
        token: string;
        expiresAt: Date;
    }>;
    verifyAndRotateRefreshToken(token: string): Promise<{
        userId: string;
        newRefreshToken: string;
        expiresAt: Date;
    }>;
    revokeRefreshToken(token: string): Promise<void>;
    revokeAllRefreshTokens(userId: string): Promise<void>;
    cleanupExpiredTokens(): Promise<number>;
    private generateRandomToken;
    private getExpirationInSeconds;
}
