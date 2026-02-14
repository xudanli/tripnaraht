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
var AirbnbService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirbnbService = void 0;
const common_1 = require("@nestjs/common");
const airbnb_client_connect_api_1 = require("./airbnb-client-connect-api");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
let AirbnbService = AirbnbService_1 = class AirbnbService {
    constructor() {
        this.logger = new common_1.Logger(AirbnbService_1.name);
        this.client = null;
        this.configDir = path.join(os.homedir(), '.tripnara-mcp');
        this.connectionIdFile = path.join(this.configDir, 'airbnb-connection-id.txt');
    }
    async onModuleInit() {
        this.logger.log('AirbnbService initialized');
    }
    async onModuleDestroy() {
        if (this.client) {
            try {
                await this.client.disconnect();
            }
            catch (error) {
                this.logger.error('Failed to disconnect Airbnb client:', error);
            }
        }
    }
    async getClient() {
        var _a;
        if (this.client && this.client.isConnected) {
            return this.client;
        }
        let savedConnectionId;
        if (fs.existsSync(this.connectionIdFile)) {
            savedConnectionId = fs.readFileSync(this.connectionIdFile, 'utf-8').trim();
            this.logger.debug(`Loaded saved connectionId: ${savedConnectionId}`);
        }
        this.client = new airbnb_client_connect_api_1.AirbnbMcpClientConnectAPI(undefined, savedConnectionId);
        try {
            await this.client.connect();
            const connectionId = this.client.getConnectionId();
            if (connectionId) {
                if (!fs.existsSync(this.configDir)) {
                    fs.mkdirSync(this.configDir, { recursive: true });
                }
                fs.writeFileSync(this.connectionIdFile, connectionId);
                this.logger.debug(`Saved connectionId: ${connectionId}`);
            }
        }
        catch (error) {
            this.logger.error('Failed to connect to Airbnb MCP:', error.message);
            if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('OAuth authorization required')) {
                const connectionId = this.client.getConnectionId();
                if (connectionId) {
                    if (!fs.existsSync(this.configDir)) {
                        fs.mkdirSync(this.configDir, { recursive: true });
                    }
                    fs.writeFileSync(this.connectionIdFile, connectionId);
                }
            }
            throw error;
        }
        return this.client;
    }
    async searchListings(params) {
        var _a, _b, _c, _d, _e, _f;
        const client = await this.getClient();
        return await client.callTool('airbnb_search', {
            location: params.location,
            adults: (_a = params.adults) !== null && _a !== void 0 ? _a : 1,
            children: (_b = params.children) !== null && _b !== void 0 ? _b : 0,
            infants: (_c = params.infants) !== null && _c !== void 0 ? _c : 0,
            pets: (_d = params.pets) !== null && _d !== void 0 ? _d : 0,
            checkin: params.checkin,
            checkout: params.checkout,
            page: (_e = params.page) !== null && _e !== void 0 ? _e : 1,
            ignoreRobotsText: (_f = params.ignoreRobotsText) !== null && _f !== void 0 ? _f : false,
        });
    }
    async getListingDetails(params) {
        var _a;
        const client = await this.getClient();
        return await client.callTool('airbnb_listing_details', {
            listingId: params.listingId,
            checkin: params.checkin,
            checkout: params.checkout,
            adults: params.adults,
            children: params.children,
            infants: params.infants,
            pets: params.pets,
            ignoreRobotsText: (_a = params.ignoreRobotsText) !== null && _a !== void 0 ? _a : false,
        });
    }
    async getListingPhotos(listingId) {
        throw new Error('getListingPhotos is not supported by geobio/mcp-server-airbnb. Use airbnb_listing_details to get listing information including photos.');
    }
    async analyzeListingPhotos(listingId) {
        throw new Error('analyzeListingPhotos is not supported by geobio/mcp-server-airbnb. Use airbnb_listing_details to get listing information.');
    }
    async listTools() {
        const client = await this.getClient();
        return await client.listTools();
    }
    async checkAuthStatus() {
        var _a;
        try {
            let savedConnectionId;
            if (fs.existsSync(this.connectionIdFile)) {
                savedConnectionId = fs.readFileSync(this.connectionIdFile, 'utf-8').trim();
            }
            if (!savedConnectionId) {
                return {
                    isAuthorized: false,
                };
            }
            const testClient = new airbnb_client_connect_api_1.AirbnbMcpClientConnectAPI(undefined, savedConnectionId);
            try {
                await testClient.connect();
                return {
                    isAuthorized: true,
                    connectionId: savedConnectionId,
                };
            }
            catch (error) {
                if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('OAuth authorization required')) {
                    const authUrl = error.message.split('Visit: ')[1] || '';
                    return {
                        isAuthorized: false,
                        authorizationUrl: authUrl,
                        connectionId: savedConnectionId,
                    };
                }
                return {
                    isAuthorized: false,
                    connectionId: savedConnectionId,
                };
            }
        }
        catch (error) {
            this.logger.error('Check auth status failed:', error);
            return {
                isAuthorized: false,
            };
        }
    }
    async getAuthorizationUrl() {
        var _a;
        try {
            const tempClient = new airbnb_client_connect_api_1.AirbnbMcpClientConnectAPI();
            try {
                await tempClient.connect();
                const connectionId = tempClient.getConnectionId();
                throw new Error('Already authorized');
            }
            catch (error) {
                if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('OAuth authorization required')) {
                    const authUrl = error.message.split('Visit: ')[1] || '';
                    const connectionId = tempClient.getConnectionId();
                    if (!connectionId) {
                        throw new Error('Failed to get connectionId');
                    }
                    if (!fs.existsSync(this.configDir)) {
                        fs.mkdirSync(this.configDir, { recursive: true });
                    }
                    fs.writeFileSync(this.connectionIdFile, connectionId);
                    return {
                        authorizationUrl: authUrl,
                        connectionId: connectionId,
                    };
                }
                throw error;
            }
        }
        catch (error) {
            this.logger.error('Get authorization URL failed:', error);
            throw error;
        }
    }
    async verifyAuthorization(connectionId) {
        var _a;
        try {
            const testClient = new airbnb_client_connect_api_1.AirbnbMcpClientConnectAPI(undefined, connectionId);
            await testClient.connect();
            if (!fs.existsSync(this.configDir)) {
                fs.mkdirSync(this.configDir, { recursive: true });
            }
            fs.writeFileSync(this.connectionIdFile, connectionId);
            return {
                isAuthorized: true,
                message: '授权成功',
            };
        }
        catch (error) {
            if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('OAuth authorization required')) {
                return {
                    isAuthorized: false,
                    message: '授权尚未完成，请完成 OAuth 流程',
                };
            }
            return {
                isAuthorized: false,
                message: error.message || '验证失败',
            };
        }
    }
};
exports.AirbnbService = AirbnbService;
exports.AirbnbService = AirbnbService = AirbnbService_1 = __decorate([
    (0, common_1.Injectable)()
], AirbnbService);
//# sourceMappingURL=airbnb.service.js.map