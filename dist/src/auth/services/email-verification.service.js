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
var EmailVerificationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailVerificationService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../prisma/prisma.service");
const nodemailer = __importStar(require("nodemailer"));
let EmailVerificationService = EmailVerificationService_1 = class EmailVerificationService {
    constructor(prisma, configService) {
        var _a, _b, _c, _d, _e, _f, _g;
        this.prisma = prisma;
        this.configService = configService;
        this.logger = new common_1.Logger(EmailVerificationService_1.name);
        this.codeExpirationMinutes = 10;
        this.codeLength = 6;
        const smtpHost = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('SMTP_HOST')) || 'smtp.gmail.com';
        const smtpPort = parseInt(((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('SMTP_PORT')) || '587', 10);
        const smtpUser = (_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('SMTP_USER');
        const smtpPassword = ((_d = this.configService) === null || _d === void 0 ? void 0 : _d.get('SMTP_PASSWORD')) || ((_e = this.configService) === null || _e === void 0 ? void 0 : _e.get('SMTP_PASS'));
        const smtpFrom = ((_f = this.configService) === null || _f === void 0 ? void 0 : _f.get('SMTP_FROM')) || smtpUser;
        const smtpSecure = ((_g = this.configService) === null || _g === void 0 ? void 0 : _g.get('SMTP_SECURE')) === 'true' || smtpPort === 465;
        if (!smtpUser || !smtpPassword) {
            this.logger.warn('SMTP 配置未完整，邮件发送功能可能不可用');
            this.logger.warn(`SMTP_HOST: ${smtpHost}, SMTP_PORT: ${smtpPort}, SMTP_USER: ${smtpUser || '未设置'}, SMTP_PASSWORD: ${smtpPassword ? '已设置' : '未设置'}`);
        }
        else {
            this.logger.log(`SMTP 配置: ${smtpHost}:${smtpPort}, secure: ${smtpSecure}`);
        }
        this.transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: smtpUser && smtpPassword ? {
                user: smtpUser,
                pass: smtpPassword,
            } : undefined,
        });
    }
    generateCode() {
        return Math.floor(100000 + Math.random() * 900000).toString().padStart(this.codeLength, '0');
    }
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    async sendVerificationCode(email) {
        var _a, _b, _c, _d, _e;
        try {
            if (!this.validateEmail(email)) {
                throw new common_1.BadRequestException('无效的邮箱地址');
            }
            const smtpUser = (_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('SMTP_USER');
            const smtpPassword = ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('SMTP_PASSWORD')) || ((_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('SMTP_PASS'));
            if (!smtpUser || !smtpPassword) {
                this.logger.error('SMTP 配置不完整，无法发送验证码邮件');
                throw new common_1.BadRequestException('邮件服务未配置，请联系管理员');
            }
            const existingCode = await this.prisma.emailVerificationCode.findFirst({
                where: {
                    email,
                    used: false,
                    expiresAt: {
                        gt: new Date(),
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });
            if (existingCode) {
                const timeSinceLastSend = Date.now() - existingCode.createdAt.getTime();
                if (timeSinceLastSend < 60000) {
                    throw new common_1.BadRequestException('验证码发送过于频繁，请稍后再试');
                }
            }
            const code = this.generateCode();
            const expiresAt = new Date(Date.now() + this.codeExpirationMinutes * 60 * 1000);
            await this.prisma.emailVerificationCode.create({
                data: {
                    email,
                    code,
                    expiresAt,
                    used: false,
                },
            });
            try {
                let smtpFrom = (_d = this.configService) === null || _d === void 0 ? void 0 : _d.get('SMTP_FROM');
                if (!smtpFrom) {
                    if (smtpUser && smtpUser.includes('@')) {
                        smtpFrom = smtpUser;
                    }
                    else {
                        smtpFrom = 'noreply@tripnara.com';
                    }
                }
                const appName = ((_e = this.configService) === null || _e === void 0 ? void 0 : _e.get('APP_NAME')) || 'TripNARA';
                await this.transporter.sendMail({
                    from: smtpFrom,
                    to: email,
                    subject: `${appName} 邮箱验证码`,
                    html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">${appName} 邮箱验证</h2>
              <p>您好，</p>
              <p>您的验证码是：</p>
              <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
                <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
              </div>
              <p>验证码有效期为 ${this.codeExpirationMinutes} 分钟，请勿泄露给他人。</p>
              <p>如果这不是您的操作，请忽略此邮件。</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="color: #999; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
            </div>
          `,
                    text: `您的 ${appName} 验证码是：${code}，有效期为 ${this.codeExpirationMinutes} 分钟。`,
                });
                this.logger.debug(`验证码已发送到 ${email}`);
            }
            catch (error) {
                this.logger.error(`发送验证码邮件失败: ${(error === null || error === void 0 ? void 0 : error.message) || error}`, error === null || error === void 0 ? void 0 : error.stack);
                if (error === null || error === void 0 ? void 0 : error.response) {
                    this.logger.error(`SMTP 响应错误: ${JSON.stringify(error.response)}`);
                }
                if (error === null || error === void 0 ? void 0 : error.code) {
                    this.logger.error(`SMTP 错误代码: ${error.code}`);
                }
                const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || (error === null || error === void 0 ? void 0 : error.toString()) || 'Unknown error';
                throw new common_1.BadRequestException(`发送验证码失败: ${errorMessage}`);
            }
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            this.logger.error(`发送验证码时发生意外错误: ${(error === null || error === void 0 ? void 0 : error.message) || error}`, error === null || error === void 0 ? void 0 : error.stack);
            const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || (error === null || error === void 0 ? void 0 : error.toString()) || 'Unknown error occurred';
            throw new common_1.BadRequestException(`发送验证码失败: ${errorMessage}`);
        }
    }
    async verifyCode(email, code) {
        if (!this.validateEmail(email)) {
            throw new common_1.BadRequestException('无效的邮箱地址');
        }
        const verificationCode = await this.prisma.emailVerificationCode.findFirst({
            where: {
                email,
                code,
                used: false,
                expiresAt: {
                    gt: new Date(),
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        if (!verificationCode) {
            return false;
        }
        await this.prisma.emailVerificationCode.update({
            where: { id: verificationCode.id },
            data: { used: true },
        });
        return true;
    }
    async cleanupExpiredCodes() {
        const deleted = await this.prisma.emailVerificationCode.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: new Date() } },
                    { used: true },
                ],
            },
        });
        if (deleted.count > 0) {
            this.logger.debug(`清理了 ${deleted.count} 条过期验证码记录`);
        }
    }
};
exports.EmailVerificationService = EmailVerificationService;
exports.EmailVerificationService = EmailVerificationService = EmailVerificationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], EmailVerificationService);
//# sourceMappingURL=email-verification.service.js.map