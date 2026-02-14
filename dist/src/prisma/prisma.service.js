"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PrismaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const config_1 = require("@nestjs/config");
let PrismaService = PrismaService_1 = class PrismaService extends client_1.PrismaClient {
    constructor(configService) {
        var _a, _b;
        super();
        this.configService = configService;
        this.logger = new common_1.Logger(PrismaService_1.name);
        this.isConnected = false;
        const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
            process.env.MCP_MODE === 'true';
        const databaseUrl = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('DATABASE_URL')) || process.env.DATABASE_URL;
        const allowNoDb = !databaseUrl ||
            ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('ALLOW_NO_DATABASE')) === 'true' ||
            process.env.ALLOW_NO_DATABASE === 'true' ||
            isMcpMode;
        this.skipConnection = allowNoDb;
        if (this.skipConnection) {
            if (!databaseUrl) {
                this.logger.warn('PrismaService: DATABASE_URL 未设置，跳过数据库连接');
            }
            else {
                this.logger.warn('PrismaService: Skipping database connection (MCP/test mode)');
            }
        }
    }
    async onModuleInit() {
        var _a;
        console.log('🔌 [Prisma] PrismaService onModuleInit called - START');
        this.logger.log('🔌 [Prisma] PrismaService onModuleInit called');
        if (this.skipConnection) {
            console.log('⚠️ [Prisma] Skipping database connection (MCP/test mode)');
            this.logger.warn('⚠️ [Prisma] Skipping database connection (MCP/test mode)');
            console.log('🔌 [Prisma] PrismaService onModuleInit called - END (skipConnection)');
            return;
        }
        const databaseUrl = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('DATABASE_URL')) || process.env.DATABASE_URL;
        if (!databaseUrl) {
            this.logger.warn('⚠️ [Prisma] DATABASE_URL 未设置，跳过数据库连接');
            return;
        }
        this.logger.log('🔌 [Prisma] 正在尝试连接...');
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Connection Timeout')), 2000));
        try {
            await Promise.race([this.$connect(), timeout]);
            this.isConnected = true;
            this.logger.log('✅ [Prisma] 连接成功');
        }
        catch (e) {
            const errorMessage = (e === null || e === void 0 ? void 0 : e.message) || String(e);
            this.logger.warn(`⚠️ [Prisma] 连接超时或失败，跳过数据库连接，继续启动 App。错误: ${errorMessage}`);
        }
    }
    async onModuleDestroy() {
        if (this.isConnected) {
            try {
                await this.$disconnect();
                this.logger.log('Database connection closed');
            }
            catch (error) {
                this.logger.warn(`Error disconnecting from database: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
            }
        }
    }
    isDbConnected() {
        return this.isConnected;
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = PrismaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PrismaService);
//# sourceMappingURL=prisma.service.js.map