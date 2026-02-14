"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ExaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExaService = void 0;
const common_1 = require("@nestjs/common");
const exa_client_1 = require("./exa-client");
let ExaService = ExaService_1 = class ExaService {
    constructor() {
        this.logger = new common_1.Logger(ExaService_1.name);
        this.client = null;
    }
    async onModuleInit() {
        this.logger.log('ExaService initialized');
    }
    async onModuleDestroy() {
        if (this.client) {
            try {
                await this.client.disconnect();
            }
            catch (error) {
                this.logger.error('Failed to disconnect Exa client:', error);
            }
        }
    }
    async getClient() {
        if (this.client && this.client.getIsConnected()) {
            return this.client;
        }
        this.client = new exa_client_1.ExaMcpClient();
        try {
            await this.client.connect();
        }
        catch (error) {
            this.logger.error('Failed to connect to Exa MCP:', error.message);
            throw error;
        }
        return this.client;
    }
    async webSearch(query, options) {
        const client = await this.getClient();
        const args = {
            query,
            ...options,
        };
        return await client.callTool('web_search_exa', args);
    }
    async getCodeContext(query, options) {
        const client = await this.getClient();
        const args = {
            query,
            ...options,
        };
        return await client.callTool('get_code_context_exa', args);
    }
    async companyResearch(company, options) {
        const client = await this.getClient();
        const args = {
            companyName: company,
            ...options,
        };
        return await client.callTool('company_research_exa', args);
    }
    async webSearchAdvanced(query, options) {
        const client = await this.getClient();
        const args = {
            query,
            ...options,
        };
        return await client.callTool('web_search_advanced_exa', args);
    }
    async deepSearch(query, options) {
        const client = await this.getClient();
        const args = {
            query,
            ...options,
        };
        return await client.callTool('deep_search_exa', args);
    }
    async crawlUrl(url, options) {
        const client = await this.getClient();
        const args = {
            url,
            ...options,
        };
        return await client.callTool('crawling_exa', args);
    }
    async peopleSearch(query, options) {
        const client = await this.getClient();
        const args = {
            query,
            ...options,
        };
        return await client.callTool('people_search_exa', args);
    }
    async deepResearcherStart(query, options) {
        const client = await this.getClient();
        const args = {
            query,
            ...options,
        };
        return await client.callTool('deep_researcher_start', args);
    }
    async deepResearcherCheck(taskId) {
        const client = await this.getClient();
        return await client.callTool('deep_researcher_check', { taskId });
    }
    async listTools() {
        const client = await this.getClient();
        return await client.listTools();
    }
    async checkConnectionStatus() {
        var _a;
        const hasApiKey = !!process.env.EXA_API_KEY;
        const isConnected = ((_a = this.client) === null || _a === void 0 ? void 0 : _a.getIsConnected()) || false;
        return {
            isConnected,
            hasApiKey,
        };
    }
};
exports.ExaService = ExaService;
exports.ExaService = ExaService = ExaService_1 = __decorate([
    (0, common_1.Injectable)()
], ExaService);
//# sourceMappingURL=exa.service.js.map