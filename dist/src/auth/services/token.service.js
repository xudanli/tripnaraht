"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TokenService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../../prisma/prisma.service");
const bcrypt = __importStar(require("bcrypt"));
let TokenService = TokenService_1 = class TokenService {
    constructor(jwtService, prisma, configService) {
        var _a, _b;
        this.jwtService = jwtService;
        this.prisma = prisma;
        this.configService = configService;
        this.logger = new common_1.Logger(TokenService_1.name);
        this.accessTokenExpiresIn = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('JWT_ACCESS_TOKEN_EXPIRES_IN')) || '48h';
        this.refreshTokenExpiresInDays = parseInt(((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS')) || '30', 10);
    }
    async issueAccessToken(userId, email) {
        const payload = {
            sub: userId,
            email,
        };
        return this.jwtService.signAsync(payload, {
            expiresIn: this.accessTokenExpiresIn,
        });
    }
    async issueRefreshToken(userId) {
        const token = this.generateRandomToken();
        const tokenHash = await bcrypt.hash(token, 10);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + this.refreshTokenExpiresInDays);
        await this.prisma.refreshToken.create({
            data: {
                userId,
                tokenHash,
                expiresAt,
            },
        });
        this.logger.debug(`Issued refresh token for user ${userId}, expires at ${expiresAt}`);
        return { token, expiresAt };
    }
    async verifyAndRotateRefreshToken(token) {
        const tokens = await this.prisma.refreshToken.findMany({
            where: {
                revokedAt: null,
                expiresAt: {
                    gt: new Date(),
                },
            },
            include: {
                User: true,
            },
        });
        let matchedToken = null;
        for (const dbToken of tokens) {
            const isValid = await bcrypt.compare(token, dbToken.tokenHash);
            if (isValid) {
                matchedToken = dbToken;
                break;
            }
        }
        if (!matchedToken) {
            throw new common_1.UnauthorizedException('Invalid or expired refresh token');
        }
        await this.prisma.refreshToken.update({
            where: { id: matchedToken.id },
            data: { revokedAt: new Date() },
        });
        const { token: newToken, expiresAt } = await this.issueRefreshToken(matchedToken.userId);
        return {
            userId: matchedToken.userId,
            newRefreshToken: newToken,
            expiresAt,
        };
    }
    async revokeRefreshToken(token) {
        const tokens = await this.prisma.refreshToken.findMany({
            where: {
                revokedAt: null,
                expiresAt: {
                    gt: new Date(),
                },
            },
        });
        for (const dbToken of tokens) {
            const isValid = await bcrypt.compare(token, dbToken.tokenHash);
            if (isValid) {
                await this.prisma.refreshToken.update({
                    where: { id: dbToken.id },
                    data: { revokedAt: new Date() },
                });
                return;
            }
        }
        this.logger.warn('Attempted to revoke non-existent refresh token');
    }
    async revokeAllRefreshTokens(userId) {
        await this.prisma.refreshToken.updateMany({
            where: {
                userId,
                revokedAt: null,
            },
            data: {
                revokedAt: new Date(),
            },
        });
        this.logger.debug(`Revoked all refresh tokens for user ${userId}`);
    }
    async cleanupExpiredTokens() {
        const result = await this.prisma.refreshToken.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date(),
                },
            },
        });
        this.logger.debug(`Cleaned up ${result.count} expired refresh tokens`);
        return result.count;
    }
    generateRandomToken() {
        const crypto = require('crypto');
        return crypto.randomBytes(32).toString('base64url');
    }
    getExpirationInSeconds(expiresIn) {
        const match = expiresIn.match(/^(\d+)([smhd])$/);
        if (!match) {
            return 15 * 60;
        }
        const value = parseInt(match[1], 10);
        const unit = match[2];
        switch (unit) {
            case 's':
                return value;
            case 'm':
                return value * 60;
            case 'h':
                return value * 3600;
            case 'd':
                return value * 86400;
            default:
                return 15 * 60;
        }
    }
};
exports.TokenService = TokenService;
exports.TokenService = TokenService = TokenService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        prisma_service_1.PrismaService,
        config_1.ConfigService])
], TokenService);
//# sourceMappingURL=token.service.js.map