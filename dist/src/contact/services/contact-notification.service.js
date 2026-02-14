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
var ContactNotificationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactNotificationService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer = __importStar(require("nodemailer"));
let ContactNotificationService = ContactNotificationService_1 = class ContactNotificationService {
    constructor(configService) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        this.configService = configService;
        this.logger = new common_1.Logger(ContactNotificationService_1.name);
        const smtpHost = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('SMTP_HOST')) || 'smtp.exmail.qq.com';
        const smtpPort = parseInt(((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('SMTP_PORT')) || '587', 10);
        const smtpUser = (_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('SMTP_USER');
        const smtpPassword = ((_d = this.configService) === null || _d === void 0 ? void 0 : _d.get('SMTP_PASSWORD')) ||
            ((_e = this.configService) === null || _e === void 0 ? void 0 : _e.get('SMTP_PASS'));
        const smtpFrom = ((_f = this.configService) === null || _f === void 0 ? void 0 : _f.get('SMTP_FROM')) || smtpUser;
        const smtpSecure = ((_g = this.configService) === null || _g === void 0 ? void 0 : _g.get('SMTP_SECURE')) === 'true' || smtpPort === 465;
        this.notificationEmail = ((_h = this.configService) === null || _h === void 0 ? void 0 : _h.get('CONTACT_NOTIFICATION_EMAIL')) ||
            'support@tripnara.com';
        if (!smtpUser || !smtpPassword) {
            this.logger.warn('SMTP 配置未完整，邮件通知功能不可用');
            this.transporter = null;
        }
        else {
            this.transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpSecure,
                auth: {
                    user: smtpUser,
                    pass: smtpPassword,
                },
            });
            this.logger.log(`联系通知服务已初始化，通知邮箱: ${this.notificationEmail}`);
        }
    }
    async sendNotificationEmail(messageId, message, userId, imageCount, imageUrls) {
        if (!this.transporter) {
            this.logger.warn('邮件发送器未配置，跳过邮件通知');
            return;
        }
        try {
            const smtpFrom = this.configService.get('SMTP_FROM') ||
                this.configService.get('SMTP_USER') ||
                'noreply@tripnara.com';
            const appName = this.configService.get('APP_NAME') || 'TripNARA';
            const userInfo = userId ? `用户ID: ${userId}` : '匿名用户';
            const messagePreview = message
                ? (message.length > 200 ? message.substring(0, 200) + '...' : message)
                : '无文本消息';
            const imageSection = imageCount > 0
                ? `
        <div style="margin: 20px 0;">
          <h3 style="color: #333;">图片 (${imageCount} 张)</h3>
          ${imageUrls && imageUrls.length > 0
                    ? imageUrls.map(url => `<p><a href="${url}">${url}</a></p>`).join('')
                    : '<p>图片已上传到服务器</p>'}
        </div>
        `
                : '';
            await this.transporter.sendMail({
                from: smtpFrom,
                to: this.notificationEmail,
                subject: `[${appName}] 新的联系消息 - ${messageId}`,
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
            <h2 style="color: #333;">新的联系消息</h2>
            
            <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
              <p><strong>消息ID:</strong> ${messageId}</p>
              <p><strong>提交用户:</strong> ${userInfo}</p>
              <p><strong>提交时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
            </div>

            <div style="margin: 20px 0;">
              <h3 style="color: #333;">消息内容</h3>
              <div style="background-color: #fafafa; padding: 15px; border-left: 4px solid #007bff; white-space: pre-wrap;">
                ${messagePreview || '（无文本消息）'}
              </div>
            </div>

            ${imageSection}

            <div style="margin: 20px 0; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107;">
              <p><strong>注意:</strong> 请登录管理系统查看完整消息详情并处理。</p>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">此邮件由系统自动发送，请勿直接回复。</p>
          </div>
        `,
                text: `
新的联系消息

消息ID: ${messageId}
提交用户: ${userInfo}
提交时间: ${new Date().toLocaleString('zh-CN')}

消息内容:
${message || '（无文本消息）'}

${imageCount > 0 ? `图片数量: ${imageCount} 张` : ''}

请登录管理系统查看完整消息详情并处理。
        `.trim(),
            });
            this.logger.log(`通知邮件已发送到 ${this.notificationEmail}`);
        }
        catch (error) {
            this.logger.error(`发送通知邮件失败: ${error.message}`, error.stack);
        }
    }
};
exports.ContactNotificationService = ContactNotificationService;
exports.ContactNotificationService = ContactNotificationService = ContactNotificationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ContactNotificationService);
//# sourceMappingURL=contact-notification.service.js.map