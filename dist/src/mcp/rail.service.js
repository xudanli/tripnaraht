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
var RailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RailService = void 0;
const common_1 = require("@nestjs/common");
const rail_client_1 = require("./rail-client");
let RailService = RailService_1 = class RailService {
    constructor() {
        this.logger = new common_1.Logger(RailService_1.name);
        this.client = null;
        this.isConnected = false;
        try {
            this.client = (0, rail_client_1.getRailClient)();
            this.logger.log('✅ Rail Service initialized');
        }
        catch (error) {
            this.logger.warn(`⚠️  Failed to initialize Rail client: ${error.message}`);
            this.client = null;
        }
    }
    async onModuleInit() {
    }
    async onModuleDestroy() {
        if (this.client && this.isConnected) {
            try {
                await this.client.disconnect();
                this.isConnected = false;
                this.logger.log('✅ Rail client disconnected');
            }
            catch (error) {
                this.logger.warn(`Failed to disconnect Rail client: ${error.message}`);
            }
        }
    }
    async ensureConnected() {
        if (!this.client) {
            throw new Error('Rail client not initialized');
        }
        if (!this.isConnected) {
            try {
                await this.client.connect();
                this.isConnected = true;
                this.logger.debug('✅ Rail client connected');
            }
            catch (error) {
                this.logger.error(`Failed to connect Rail client: ${error.message}`);
                throw new Error(`Rail MCP connection failed: ${error.message}`);
            }
        }
    }
    async searchRoutes(params) {
        await this.ensureConnected();
        try {
            const result = await this.client.callTool('searchRoutes', {
                origin: params.origin,
                destination: params.destination,
                date: params.date,
            });
            return result;
        }
        catch (error) {
            this.logger.error(`Rail searchRoutes failed: ${error.message}`);
            throw error;
        }
    }
    async getSchedule(params) {
        await this.ensureConnected();
        try {
            const result = await this.client.callTool('getSchedule', {
                origin: params.origin,
                destination: params.destination,
                date: params.date,
            });
            return result;
        }
        catch (error) {
            this.logger.debug(`getSchedule not available, trying searchRoutes`);
            return this.searchRoutes({
                origin: params.origin,
                destination: params.destination,
                date: params.date,
            });
        }
    }
    isServiceAvailable() {
        return this.client !== null && process.env.ENABLE_RAIL_MCP !== 'false';
    }
    async listTools() {
        await this.ensureConnected();
        try {
            const tools = await this.client.listTools();
            return (tools.tools || []).map((tool) => tool.name);
        }
        catch (error) {
            this.logger.error(`Failed to list Rail tools: ${error.message}`);
            return [];
        }
    }
};
exports.RailService = RailService;
exports.RailService = RailService = RailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RailService);
//# sourceMappingURL=rail.service.js.map