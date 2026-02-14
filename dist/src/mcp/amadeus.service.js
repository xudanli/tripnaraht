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
var AmadeusService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmadeusService = void 0;
const common_1 = require("@nestjs/common");
const amadeus_client_connect_api_1 = require("./amadeus-client-connect-api");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
let AmadeusService = AmadeusService_1 = class AmadeusService {
    constructor() {
        this.logger = new common_1.Logger(AmadeusService_1.name);
        this.client = null;
        this.configDir = path.join(os.homedir(), '.tripnara-mcp');
        this.connectionIdFile = path.join(this.configDir, 'amadeus-connection-id.txt');
    }
    async onModuleInit() {
        this.logger.log('AmadeusService initialized');
    }
    async onModuleDestroy() {
        if (this.client) {
            try {
                await this.client.disconnect();
            }
            catch (error) {
                this.logger.error('Failed to disconnect Amadeus client:', error);
            }
        }
    }
    async getClient() {
        var _a;
        if (this.client && this.client.isConnected) {
            return this.client;
        }
        const hasCredentials = (process.env.AMADEUS_CLIENT_ID || process.env.AMADEUS_API_KEY) &&
            (process.env.AMADEUS_CLIENT_SECRET || process.env.AMADEUS_API_SECRET);
        let savedConnectionId;
        if (!hasCredentials && fs.existsSync(this.connectionIdFile)) {
            savedConnectionId = fs.readFileSync(this.connectionIdFile, 'utf-8').trim();
            this.logger.debug(`Loaded saved connectionId: ${savedConnectionId}`);
        }
        else if (hasCredentials && fs.existsSync(this.connectionIdFile)) {
            this.logger.debug('Amadeus credentials found, will create new connection with config');
            try {
                fs.unlinkSync(this.connectionIdFile);
                this.logger.debug('Deleted old connectionId file to recreate with config');
            }
            catch (error) {
            }
        }
        this.client = new amadeus_client_connect_api_1.AmadeusMcpClientConnectAPI(undefined, savedConnectionId);
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
            this.logger.error('Failed to connect to Amadeus MCP:', error.message);
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
    async searchFlightOffers(params) {
        const client = await this.getClient();
        return await client.callTool('search_flight_offers', {
            originLocationCode: params.originLocationCode,
            destinationLocationCode: params.destinationLocationCode,
            departureDate: params.departureDate,
            adults: params.adults,
            returnDate: params.returnDate,
            children: params.children,
            infants: params.infants,
            travelClass: params.travelClass,
            includedAirlineCodes: params.includedAirlineCodes,
            excludedAirlineCodes: params.excludedAirlineCodes,
            nonStop: params.nonStop,
            currencyCode: params.currencyCode,
            maxPrice: params.maxPrice,
            max: params.max,
        });
    }
    async ping() {
        const client = await this.getClient();
        return await client.callTool('ping', {});
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
            const testClient = new amadeus_client_connect_api_1.AmadeusMcpClientConnectAPI(undefined, savedConnectionId);
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
            const tempClient = new amadeus_client_connect_api_1.AmadeusMcpClientConnectAPI();
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
            const testClient = new amadeus_client_connect_api_1.AmadeusMcpClientConnectAPI(undefined, connectionId);
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
exports.AmadeusService = AmadeusService;
exports.AmadeusService = AmadeusService = AmadeusService_1 = __decorate([
    (0, common_1.Injectable)()
], AmadeusService);
//# sourceMappingURL=amadeus.service.js.map