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
var GoogleRoutesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleRoutesService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const https = __importStar(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
const transport_interface_1 = require("../interfaces/transport.interface");
let GoogleRoutesService = GoogleRoutesService_1 = class GoogleRoutesService {
    constructor(configService) {
        var _a, _b;
        this.configService = configService;
        this.logger = new common_1.Logger(GoogleRoutesService_1.name);
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 3;
        this.isCircuitOpen = false;
        this.circuitOpenUntil = null;
        this.circuitResetMs = 5 * 60 * 1000;
        this.apiKey = (_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('GOOGLE_ROUTES_API_KEY');
        let baseURL = ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('GOOGLE_ROUTES_BASE_URL')) || 'https://routes.googleapis.com';
        if (baseURL.startsWith('http://')) {
            this.logger.warn(`Google Routes baseURL 使用 HTTP，自动转换为 HTTPS: ${baseURL}`);
            baseURL = baseURL.replace('http://', 'https://');
        }
        if (!baseURL.startsWith('https://')) {
            this.logger.warn(`Google Routes baseURL 不是 HTTPS，强制添加: ${baseURL}`);
            baseURL = `https://${baseURL.replace(/^https?:\/\//, '')}`;
        }
        baseURL = baseURL.replace(/\/$/, '');
        try {
            const url = new URL(baseURL);
            if (url.protocol !== 'https:') {
                throw new Error(`Google Routes baseURL 必须使用 HTTPS，当前: ${url.protocol}`);
            }
            this.baseURL = baseURL;
        }
        catch (error) {
            this.logger.error(`Google Routes baseURL 格式无效: ${baseURL}, 错误: ${error.message}`);
            this.baseURL = 'https://routes.googleapis.com';
        }
    }
    async onModuleInit() {
        if (this.axiosInstance) {
            return;
        }
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
            baseURL: this.baseURL,
            timeout: 10000,
            httpsAgent,
            proxy: false,
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': this.apiKey || '',
                'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters',
            },
        });
        this.logger.debug(`Google Routes 配置: baseURL=${this.baseURL}, protocol=https, proxy=${proxyUrl ? 'enabled' : 'disabled'}`);
        this.axiosInstance.interceptors.request.use((config) => {
            if (config.url) {
                const fullUrl = config.baseURL ? `${config.baseURL}${config.url}` : config.url;
                if (fullUrl.startsWith('http://')) {
                    this.logger.error(`检测到 HTTP 请求，强制转换为 HTTPS: ${fullUrl}`);
                    config.url = fullUrl.replace('http://', 'https://');
                    if (config.baseURL) {
                        config.baseURL = config.baseURL.replace('http://', 'https://');
                    }
                }
            }
            return config;
        }, (error) => {
            return Promise.reject(error);
        });
    }
    getAxiosInstance() {
        if (!this.axiosInstance) {
            this.logger.warn('GoogleRoutesService: axios 实例尚未初始化，同步初始化（可能阻塞）');
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
                baseURL: this.baseURL,
                timeout: 10000,
                httpsAgent,
                proxy: false,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.apiKey || '',
                    'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters',
                },
            });
        }
        return this.axiosInstance;
    }
    async getRoutes(fromLat, fromLng, toLat, toLng, travelMode = 'TRANSIT', preferences) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        if (!this.apiKey) {
            this.logger.debug('Google Routes API Key 未配置，使用估算数据');
            return [];
        }
        if (this.isCircuitOpen) {
            if (this.circuitOpenUntil && Date.now() < this.circuitOpenUntil) {
                this.logger.debug('Google Routes API 熔断器开启，使用估算数据');
                return [];
            }
            else {
                this.logger.debug('Google Routes API 熔断器超时，尝试重置');
                this.isCircuitOpen = false;
                this.circuitOpenUntil = null;
                this.consecutiveFailures = 0;
            }
        }
        try {
            const requestBody = {
                origin: {
                    location: {
                        latLng: {
                            latitude: fromLat,
                            longitude: fromLng,
                        },
                    },
                },
                destination: {
                    location: {
                        latLng: {
                            latitude: toLat,
                            longitude: toLng,
                        },
                    },
                },
                travelMode: travelMode,
                routingPreference: 'TRAFFIC_AWARE',
                computeAlternativeRoutes: false,
                ...(travelMode === 'TRANSIT' && {
                    transitPreferences: {
                        routingPreference: (preferences === null || preferences === void 0 ? void 0 : preferences.lessWalking) ? 'LESS_WALKING' : 'DEFAULT',
                    },
                }),
                ...(travelMode === 'DRIVING' && {
                    drivingOptions: {
                        ...((preferences === null || preferences === void 0 ? void 0 : preferences.avoidHighways) && { avoidHighways: true }),
                        ...((preferences === null || preferences === void 0 ? void 0 : preferences.avoidTolls) && { avoidTolls: true }),
                    },
                }),
            };
            const apiPath = '/directions/v2:computeRoutes';
            const finalUrl = `${this.baseURL}${apiPath}`;
            if (!finalUrl.startsWith('https://')) {
                throw new Error(`Google Routes API URL 必须使用 HTTPS: ${finalUrl}`);
            }
            this.logger.debug(`Google Routes API 请求: ${finalUrl}`);
            const response = await this.getAxiosInstance().post(apiPath, requestBody);
            this.consecutiveFailures = 0;
            this.isCircuitOpen = false;
            this.circuitOpenUntil = null;
            return this.parseGoogleRoutesResponse(response.data, travelMode);
        }
        catch (error) {
            this.consecutiveFailures++;
            const is403 = ((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 403;
            const is401 = ((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) === 401;
            const errorDetails = ((_c = error.response) === null || _c === void 0 ? void 0 : _c.data) || {};
            const errorMessage = ((_d = errorDetails.error) === null || _d === void 0 ? void 0 : _d.message) || error.message || '';
            if (is403 && (errorMessage.includes('SSL') || errorMessage.includes('ssl') || errorMessage.includes('SSL is required'))) {
                this.logger.error(`Google Routes API SSL 错误 (403): ${errorMessage}`, {
                    baseURL: this.baseURL,
                    requestUrl: (_e = error.config) === null || _e === void 0 ? void 0 : _e.url,
                    fullUrl: ((_f = error.config) === null || _f === void 0 ? void 0 : _f.baseURL) ? `${error.config.baseURL}${error.config.url}` : (_g = error.config) === null || _g === void 0 ? void 0 : _g.url,
                    errorCode: (_h = errorDetails.error) === null || _h === void 0 ? void 0 : _h.code,
                    errorStatus: (_j = errorDetails.error) === null || _j === void 0 ? void 0 : _j.status,
                });
                this.isCircuitOpen = true;
                this.circuitOpenUntil = Date.now() + this.circuitResetMs;
                this.logger.error(`Google Routes API 因 SSL 配置错误被禁用。` +
                    `请检查：1) baseURL 必须使用 HTTPS 2) 代理配置是否正确 3) 网络环境是否支持 HTTPS`);
                return [];
            }
            if (is403 || is401) {
                this.logger.warn(`Google Routes API 认证失败 (${(_k = error.response) === null || _k === void 0 ? void 0 : _k.status}): ${errorMessage}`, {
                    apiKeyPresent: !!this.apiKey,
                    apiKeyLength: ((_l = this.apiKey) === null || _l === void 0 ? void 0 : _l.length) || 0,
                    baseURL: this.baseURL,
                    errorCode: (_m = errorDetails.error) === null || _m === void 0 ? void 0 : _m.code,
                    errorStatus: (_o = errorDetails.error) === null || _o === void 0 ? void 0 : _o.status,
                    consecutiveFailures: this.consecutiveFailures,
                });
                if (this.consecutiveFailures >= 1) {
                    this.isCircuitOpen = true;
                    this.circuitOpenUntil = Date.now() + this.circuitResetMs;
                    this.logger.warn(`Google Routes API 因认证错误被暂时禁用，将在 ${this.circuitResetMs / 1000 / 60} 分钟后重试。` +
                        `请检查：1) API Key 是否正确 2) Routes API 是否已启用 3) 计费是否已开启 4) API Key 是否有 Routes API 权限`);
                }
            }
            else {
                this.logger.debug(`Google Routes API 调用失败: ${error.message}`, {
                    status: (_p = error.response) === null || _p === void 0 ? void 0 : _p.status,
                    consecutiveFailures: this.consecutiveFailures,
                });
                if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
                    this.isCircuitOpen = true;
                    this.circuitOpenUntil = Date.now() + this.circuitResetMs;
                    this.logger.warn(`Google Routes API 因连续失败被暂时禁用，将在 ${this.circuitResetMs / 1000 / 60} 分钟后重试`);
                }
            }
            return [];
        }
    }
    parseGoogleRoutesResponse(data, travelMode) {
        var _a, _b, _c, _d, _e, _f;
        const options = [];
        if (!data.routes || data.routes.length === 0) {
            return options;
        }
        for (const route of data.routes) {
            const leg = (_a = route.legs) === null || _a === void 0 ? void 0 : _a[0];
            if (!leg)
                continue;
            const durationSeconds = ((_b = leg.duration) === null || _b === void 0 ? void 0 : _b.value) || 0;
            const durationMinutes = Math.round(durationSeconds / 60);
            const walkDistance = ((_c = leg.steps) === null || _c === void 0 ? void 0 : _c.filter((step) => step.travelMode === 'WALK').reduce((sum, step) => { var _a; return sum + (((_a = step.distance) === null || _a === void 0 ? void 0 : _a.value) || 0); }, 0)) || 0;
            const transfers = travelMode === 'TRANSIT'
                ? (((_f = (_e = (_d = route.legs) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.steps) === null || _f === void 0 ? void 0 : _f.filter((step) => step.travelMode === 'TRANSIT').length) || 0) - 1
                : 0;
            const cost = this.estimateCostFromRoute(route, travelMode);
            let mode;
            if (travelMode === 'WALKING') {
                mode = transport_interface_1.TransportMode.WALKING;
            }
            else if (travelMode === 'DRIVING') {
                mode = transport_interface_1.TransportMode.TAXI;
            }
            else {
                mode = transport_interface_1.TransportMode.TRANSIT;
            }
            options.push({
                mode,
                durationMinutes,
                cost,
                walkDistance,
                transfers: transfers > 0 ? transfers : undefined,
                description: this.generateDescription(route, travelMode),
            });
        }
        return options;
    }
    estimateCostFromRoute(route, travelMode) {
        var _a, _b, _c;
        const distanceMeters = ((_c = (_b = (_a = route.legs) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.distance) === null || _c === void 0 ? void 0 : _c.value) || 0;
        if (travelMode === 'WALKING') {
            return 0;
        }
        else if (travelMode === 'DRIVING') {
            const distanceKm = distanceMeters / 1000;
            return Math.round(15 + distanceKm * 3);
        }
        else {
            if (distanceMeters < 5000) {
                return 3;
            }
            return 3 + Math.floor((distanceMeters - 5000) / 5000) * 2;
        }
    }
    generateDescription(route, travelMode) {
        var _a, _b, _c;
        if (travelMode === 'WALKING') {
            return '步行：免费，距离较近';
        }
        else if (travelMode === 'DRIVING') {
            return '打车：门到门，最方便';
        }
        else {
            const transfers = ((_c = (_b = (_a = route.legs) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.steps) === null || _c === void 0 ? void 0 : _c.filter((step) => step.travelMode === 'TRANSIT').length) || 0;
            return transfers > 1
                ? `公共交通：需要换乘 ${transfers - 1} 次`
                : '公共交通：经济实惠';
        }
    }
};
exports.GoogleRoutesService = GoogleRoutesService;
exports.GoogleRoutesService = GoogleRoutesService = GoogleRoutesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GoogleRoutesService);
//# sourceMappingURL=google-routes.service.js.map