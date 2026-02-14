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
var RollConnectionPoolService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollConnectionPoolService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let RollConnectionPoolService = RollConnectionPoolService_1 = class RollConnectionPoolService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RollConnectionPoolService_1.name);
        this.bridgeUrl =
            this.configService.get('ROLL_BRIDGE_URL') ||
                'http://localhost:8001';
        this.maxConnections = parseInt(this.configService.get('ROLL_MAX_CONNECTIONS') || '10', 10);
        this.keepAlive = this.configService.get('ROLL_KEEP_ALIVE') !== false;
        this.keepAliveTimeout = parseInt(this.configService.get('ROLL_KEEP_ALIVE_TIMEOUT') || '5000', 10);
        this.initializeAgent();
    }
    initializeAgent() {
        const http = require('http');
        const https = require('https');
        const { URL } = require('url');
        const url = new URL(this.bridgeUrl);
        const isHttps = url.protocol === 'https:';
        const Agent = isHttps ? https.Agent : http.Agent;
        this.agent = new Agent({
            keepAlive: this.keepAlive,
            keepAliveMsecs: this.keepAliveTimeout,
            maxSockets: this.maxConnections,
            maxFreeSockets: Math.floor(this.maxConnections / 2),
            timeout: 10000,
        });
        this.logger.log(`[RollConnectionPool] 连接池初始化: maxConnections=${this.maxConnections}, keepAlive=${this.keepAlive}`);
    }
    getAgent() {
        return this.agent;
    }
    getBridgeUrl() {
        return this.bridgeUrl;
    }
    onModuleDestroy() {
        if (this.agent) {
            this.agent.destroy();
            this.logger.log('[RollConnectionPool] 连接池已清理');
        }
    }
};
exports.RollConnectionPoolService = RollConnectionPoolService;
exports.RollConnectionPoolService = RollConnectionPoolService = RollConnectionPoolService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RollConnectionPoolService);
//# sourceMappingURL=roll-connection-pool.service.js.map