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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var GoogleMapsDirectService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleMapsDirectService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const https = __importStar(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
let GoogleMapsDirectService = GoogleMapsDirectService_1 = class GoogleMapsDirectService {
    constructor(configService) {
        var _a;
        this.configService = configService;
        this.logger = new common_1.Logger(GoogleMapsDirectService_1.name);
        this.apiKey = null;
        this.isAvailable = false;
        this.baseUrl = 'https://maps.googleapis.com/maps/api';
        this.apiKey = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('GOOGLE_MAPS_API_KEY')) ||
            process.env.GOOGLE_MAPS_API_KEY ||
            null;
        this.axiosInstance = null;
    }
    async onModuleInit() {
        if (this.apiKey) {
            const proxyUrl = process.env.HTTPS_PROXY ||
                process.env.https_proxy ||
                process.env.ALL_PROXY ||
                process.env.all_proxy;
            const httpsAgent = proxyUrl
                ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl)
                : new https.Agent({
                    keepAlive: true,
                    family: 4,
                    rejectUnauthorized: true,
                });
            this.axiosInstance = axios_1.default.create({
                baseURL: this.baseUrl,
                timeout: 10000,
                httpsAgent,
                proxy: false,
                headers: {
                    'User-Agent': 'TripNARA/1.0',
                },
            });
            this.isAvailable = true;
            this.logger.log('Google Maps Direct Service initialized with API Key');
        }
        else {
            this.logger.warn('Google Maps API Key not found. Service will not be available.');
            this.isAvailable = false;
        }
    }
    async onModuleDestroy() {
        this.logger.log('Google Maps Direct Service destroyed');
    }
    async getTrafficStatus(params) {
        var _a, _b, _c;
        if (!this.isServiceAvailable()) {
            this.logger.warn('Google Maps API Key not configured, cannot get traffic status');
            return null;
        }
        try {
            const radius = params.radius || 5000;
            try {
                const directionsResponse = await this.axiosInstance.get('/directions/json', {
                    params: {
                        origin: `${params.location.lat},${params.location.lng}`,
                        destination: `${params.location.lat + 0.01},${params.location.lng + 0.01}`,
                        key: this.apiKey,
                        alternatives: false,
                        traffic_model: 'best_guess',
                        departure_time: 'now',
                    },
                });
                if ((_b = (_a = directionsResponse.data) === null || _a === void 0 ? void 0 : _a.routes) === null || _b === void 0 ? void 0 : _b[0]) {
                    const route = directionsResponse.data.routes[0];
                    const leg = (_c = route.legs) === null || _c === void 0 ? void 0 : _c[0];
                    if ((leg === null || leg === void 0 ? void 0 : leg.duration_in_traffic) && (leg === null || leg === void 0 ? void 0 : leg.duration)) {
                        const trafficDelay = leg.duration_in_traffic.value - leg.duration.value;
                        const delayMinutes = Math.floor(trafficDelay / 60);
                        let status = 'OPEN';
                        let severity = 'LOW';
                        if (delayMinutes > 30) {
                            status = 'SLOW';
                            severity = 'HIGH';
                        }
                        else if (delayMinutes > 15) {
                            status = 'MODERATE';
                            severity = 'MEDIUM';
                        }
                        else if (delayMinutes > 5) {
                            status = 'SLOW';
                            severity = 'LOW';
                        }
                        return {
                            status,
                            severity,
                            description: delayMinutes > 0
                                ? `预计延迟 ${delayMinutes} 分钟`
                                : '交通畅通',
                            confidence: 0.8,
                        };
                    }
                }
            }
            catch (directionsError) {
                this.logger.warn(`[GoogleMapsDirect] Directions API调用失败: ${directionsError.message}`);
            }
            return {
                status: 'OPEN',
                severity: 'LOW',
                description: '无法获取实时交通状态，假设道路开放',
                confidence: 0.5,
            };
        }
        catch (error) {
            this.logger.error(`[GoogleMapsDirect] 获取交通状态失败: ${error.message}`, error.stack);
            return null;
        }
    }
    isServiceAvailable() {
        return this.isAvailable && !!this.apiKey;
    }
    async getRoute(params) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Maps API Key not configured');
        }
        try {
            const requestParams = {
                origin: params.origin,
                destination: params.destination,
                key: this.apiKey,
                mode: params.mode || 'driving',
                language: params.language || 'en',
                units: params.units || 'metric',
            };
            if (params.waypoints && params.waypoints.length > 0) {
                requestParams.waypoints = params.waypoints.join('|');
            }
            if (params.avoid && params.avoid.length > 0) {
                requestParams.avoid = params.avoid.join('|');
            }
            if (params.alternatives) {
                requestParams.alternatives = 'true';
            }
            const response = await this.axiosInstance.get('/directions/json', {
                params: requestParams,
            });
            if (response.data.status !== 'OK') {
                throw new Error(`Google Maps API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
            }
            return {
                success: true,
                data: response.data,
            };
        }
        catch (error) {
            this.logger.error('Failed to get route:', error.message);
            throw error;
        }
    }
    async computeDistanceMatrix(params) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Maps API Key not configured');
        }
        try {
            const requestParams = {
                origins: params.origins.join('|'),
                destinations: params.destinations.join('|'),
                key: this.apiKey,
                mode: params.mode || 'driving',
                language: params.language || 'en',
                units: params.units || 'metric',
            };
            if (params.avoid && params.avoid.length > 0) {
                requestParams.avoid = params.avoid.join('|');
            }
            if (params.departureTime) {
                requestParams.departure_time = Math.floor(params.departureTime.getTime() / 1000);
            }
            if (params.arrivalTime) {
                requestParams.arrival_time = Math.floor(params.arrivalTime.getTime() / 1000);
            }
            const response = await this.axiosInstance.get('/distancematrix/json', {
                params: requestParams,
            });
            if (response.data.status !== 'OK') {
                throw new Error(`Google Maps API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
            }
            return {
                success: true,
                data: response.data,
            };
        }
        catch (error) {
            this.logger.error('Failed to compute distance matrix:', error.message);
            throw error;
        }
    }
    async geocode(params) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Maps API Key not configured');
        }
        try {
            const requestParams = {
                key: this.apiKey,
                language: params.language || 'en',
            };
            if (params.address) {
                requestParams.address = params.address;
            }
            if (params.latlng) {
                requestParams.latlng = `${params.latlng.lat},${params.latlng.lng}`;
            }
            if (params.region) {
                requestParams.region = params.region;
            }
            const response = await this.axiosInstance.get('/geocode/json', {
                params: requestParams,
            });
            if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
                throw new Error(`Google Maps API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
            }
            return {
                success: true,
                data: response.data,
            };
        }
        catch (error) {
            this.logger.error('Failed to geocode:', error.message);
            throw error;
        }
    }
    async searchPlaces(params) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Maps API Key not configured');
        }
        try {
            const requestParams = {
                query: params.query,
                key: this.apiKey,
                language: params.language || 'en',
            };
            if (params.location) {
                requestParams.location = `${params.location.lat},${params.location.lng}`;
            }
            if (params.radius) {
                requestParams.radius = params.radius;
            }
            if (params.type) {
                requestParams.type = params.type;
            }
            const response = await this.axiosInstance.get('/place/textsearch/json', {
                params: requestParams,
            });
            if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
                throw new Error(`Google Maps API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
            }
            return {
                success: true,
                data: response.data,
            };
        }
        catch (error) {
            this.logger.error('Failed to search places:', error.message);
            throw error;
        }
    }
    async nearbySearch(params) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Maps API Key not configured');
        }
        try {
            const requestParams = {
                location: `${params.location.lat},${params.location.lng}`,
                key: this.apiKey,
                radius: params.radius || 1000,
                language: params.language || 'en',
            };
            if (params.type) {
                requestParams.type = params.type;
            }
            if (params.keyword) {
                requestParams.keyword = params.keyword;
            }
            const response = await this.axiosInstance.get('/place/nearbysearch/json', {
                params: requestParams,
            });
            if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
                throw new Error(`Google Maps API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
            }
            return {
                success: true,
                data: response.data,
            };
        }
        catch (error) {
            this.logger.error('Failed to search nearby:', error.message);
            throw error;
        }
    }
};
exports.GoogleMapsDirectService = GoogleMapsDirectService;
exports.GoogleMapsDirectService = GoogleMapsDirectService = GoogleMapsDirectService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GoogleMapsDirectService);
//# sourceMappingURL=google-maps-direct.service.js.map