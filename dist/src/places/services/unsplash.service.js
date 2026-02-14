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
var UnsplashService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnsplashService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const https_proxy_agent_1 = require("https-proxy-agent");
const https = __importStar(require("https"));
let UnsplashService = UnsplashService_1 = class UnsplashService {
    constructor(configService) {
        var _a;
        this.configService = configService;
        this.logger = new common_1.Logger(UnsplashService_1.name);
        this.baseUrl = 'https://api.unsplash.com';
        this.httpClient = null;
        this.cache = new Map();
        this.CACHE_TTL_MS = 24 * 60 * 60 * 1000;
        this.requestCount = 0;
        this.MAX_REQUESTS_PER_HOUR = 50;
        this.lastResetTime = Date.now();
        this.accessKey = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('UNSPLASH_ACCESS_KEY')) || '';
        this.initHttpClient();
    }
    initHttpClient() {
        const proxyUrl = process.env.HTTPS_PROXY ||
            process.env.https_proxy ||
            process.env.ALL_PROXY ||
            process.env.all_proxy;
        let httpsAgent;
        if (proxyUrl) {
            try {
                httpsAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
                this.logger.debug(`Unsplash HTTP 客户端已初始化（使用代理: ${proxyUrl})`);
            }
            catch (error) {
                this.logger.warn(`代理配置失败，使用直接连接: ${error.message}`);
                httpsAgent = new https.Agent({
                    keepAlive: true,
                    family: 4,
                    rejectUnauthorized: true,
                });
            }
        }
        else {
            httpsAgent = new https.Agent({
                keepAlive: true,
                family: 4,
                rejectUnauthorized: true,
            });
        }
        this.httpClient = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 20000,
            httpsAgent,
            proxy: false,
            headers: {
                'Accept-Version': 'v1',
            },
            validateStatus: (status) => status < 500,
        });
        this.httpClient.interceptors.request.use((config) => {
            if (this.accessKey && !config.headers['Authorization']) {
                config.headers['Authorization'] = `Client-ID ${this.accessKey}`;
            }
            return config;
        });
    }
    onModuleInit() {
        if (!this.accessKey) {
            this.logger.warn('⚠️ UNSPLASH_ACCESS_KEY 未配置，图片服务将返回空结果');
        }
        else {
            this.logger.log('✅ Unsplash 服务已初始化');
        }
    }
    async getBatchPlaceImages(places) {
        const startTime = Date.now();
        const results = [];
        let found = 0;
        let cached = 0;
        let failed = 0;
        const BATCH_SIZE = 5;
        for (let i = 0; i < places.length; i += BATCH_SIZE) {
            const batch = places.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(batch.map(place => this.getPlaceImage(place)));
            for (const result of batchResults) {
                results.push(result);
                if (result.photo) {
                    found++;
                    if (result.cached)
                        cached++;
                }
                else if (result.error) {
                    failed++;
                }
            }
            if (i + BATCH_SIZE < places.length) {
                await this.delay(200);
            }
        }
        return {
            success: failed < places.length,
            results,
            stats: {
                total: places.length,
                found,
                cached,
                failed,
            },
            processingTimeMs: Date.now() - startTime,
        };
    }
    async getPlaceImage(place) {
        var _a, _b, _c;
        const cacheKey = this.buildCacheKey(place);
        const cachedResult = this.getFromCache(cacheKey);
        if (cachedResult) {
            return {
                placeId: place.placeId,
                placeName: place.placeName,
                photo: cachedResult,
                cached: true,
            };
        }
        if (!this.accessKey) {
            return {
                placeId: place.placeId,
                placeName: place.placeName,
                photo: null,
                cached: false,
                error: 'Unsplash API 未配置',
            };
        }
        if (!this.checkRateLimit()) {
            return {
                placeId: place.placeId,
                placeName: place.placeName,
                photo: null,
                cached: false,
                error: '已达到 API 速率限制，请稍后重试',
            };
        }
        try {
            const photo = await this.searchPhoto(place);
            if (photo) {
                this.setCache(cacheKey, photo);
                return {
                    placeId: place.placeId,
                    placeName: place.placeName,
                    photo,
                    cached: false,
                };
            }
            else {
                return {
                    placeId: place.placeId,
                    placeName: place.placeName,
                    photo: null,
                    cached: false,
                    error: '未找到相关图片',
                };
            }
        }
        catch (error) {
            const errorMessage = error.message || '未知错误';
            const errorCode = error.code || (error.isAxiosError ? 'AXIOS_ERROR' : '');
            const errorDetails = errorCode ? ` (${errorCode})` : '';
            const statusInfo = ((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) ? ` [HTTP ${error.response.status}]` : '';
            this.logger.error(`获取图片失败 [${place.placeName}]: ${errorMessage}${errorDetails}${statusInfo}`);
            let userFriendlyError = errorMessage;
            if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNRESET') || errorMessage.includes('ENOTFOUND')) {
                userFriendlyError = '网络连接失败，请检查网络连接或稍后重试';
            }
            else if (errorMessage.includes('timeout') || errorMessage.includes('超时') || errorCode === 'ECONNABORTED') {
                userFriendlyError = '请求超时，请稍后重试';
            }
            else if (((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) === 401) {
                userFriendlyError = 'Unsplash API Key 无效';
            }
            else if (((_c = error.response) === null || _c === void 0 ? void 0 : _c.status) === 403) {
                userFriendlyError = 'Unsplash API 速率限制，请稍后重试';
            }
            return {
                placeId: place.placeId,
                placeName: place.placeName,
                photo: null,
                cached: false,
                error: userFriendlyError,
            };
        }
    }
    async searchPhoto(place) {
        let query = this.buildSearchQuery(place, false);
        let result = await this.trySearch(query, place);
        if (!result) {
            this.logger.debug(`[Unsplash] 完整查询无结果，尝试简化查询: ${place.placeName}`);
            query = this.buildSearchQuery(place, true);
            result = await this.trySearch(query, place);
        }
        return result;
    }
    async trySearch(query, place) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        this.logger.debug(`[Unsplash] 搜索: ${query}`);
        if (!this.httpClient) {
            this.initHttpClient();
        }
        const maxRetries = 3;
        const timeoutMs = 20000;
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await this.httpClient.get('/search/photos', {
                    params: {
                        query: query,
                        per_page: 1,
                        orientation: 'landscape',
                        order_by: 'relevant',
                    },
                    headers: {
                        'Authorization': `Client-ID ${this.accessKey}`,
                    },
                    timeout: timeoutMs,
                });
                if (response.status !== 200) {
                    if (response.status === 401) {
                        throw new Error('Unsplash API Key 无效');
                    }
                    if (response.status === 403) {
                        throw new Error('Unsplash API 速率限制');
                    }
                    throw new Error(`Unsplash API 错误: ${response.status}`);
                }
                const data = response.data;
                if (!data.results || data.results.length === 0) {
                    return null;
                }
                const rawPhoto = data.results[0];
                return this.transformPhoto(rawPhoto);
            }
            catch (error) {
                lastError = error;
                const errorInfo = {
                    message: error.message || '未知错误',
                    code: error.code || '无',
                    status: ((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) || '无',
                    statusText: ((_b = error.response) === null || _b === void 0 ? void 0 : _b.statusText) || '无',
                    isAxiosError: error.isAxiosError || false,
                };
                this.logger.debug(`[Unsplash] 请求错误详情 (尝试 ${attempt}/${maxRetries}): ${JSON.stringify(errorInfo)}`);
                const isRetryable = ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('fetch failed')) ||
                    ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes('timeout')) ||
                    ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes('超时')) ||
                    ((_f = error.message) === null || _f === void 0 ? void 0 : _f.includes('ECONNABORTED')) ||
                    ((_g = error.message) === null || _g === void 0 ? void 0 : _g.includes('ECONNRESET')) ||
                    ((_h = error.message) === null || _h === void 0 ? void 0 : _h.includes('ENOTFOUND')) ||
                    ((_j = error.message) === null || _j === void 0 ? void 0 : _j.includes('ETIMEDOUT')) ||
                    ((_k = error.message) === null || _k === void 0 ? void 0 : _k.includes('ECONNREFUSED')) ||
                    error.code === 'ECONNABORTED' ||
                    error.code === 'ECONNRESET' ||
                    error.code === 'ENOTFOUND' ||
                    error.code === 'ETIMEDOUT' ||
                    error.code === 'ECONNREFUSED' ||
                    (error.isAxiosError && error.code === 'ECONNABORTED') ||
                    (error.isAxiosError && ((_l = error.message) === null || _l === void 0 ? void 0 : _l.includes('timeout')));
                const isProxyOrTimeoutIssue = (error.code === 'ECONNREFUSED' || ((_m = error.message) === null || _m === void 0 ? void 0 : _m.includes('ECONNREFUSED'))) ||
                    (error.code === 'ECONNABORTED' && error.isAxiosError) ||
                    (((_o = error.message) === null || _o === void 0 ? void 0 : _o.includes('timeout')) && attempt === 1);
                if (isProxyOrTimeoutIssue && attempt === 1) {
                    this.logger.warn(`Unsplash 连接问题（${error.code || error.message}），尝试切换到直接连接`);
                    const originalProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy;
                    if (originalProxy) {
                        delete process.env.HTTPS_PROXY;
                        delete process.env.https_proxy;
                        delete process.env.ALL_PROXY;
                        delete process.env.all_proxy;
                        this.initHttpClient();
                        if (originalProxy) {
                            process.env.HTTPS_PROXY = originalProxy;
                        }
                    }
                }
                if (!isRetryable || attempt === maxRetries) {
                    throw error;
                }
                const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                this.logger.warn(`[Unsplash] 请求失败 (尝试 ${attempt}/${maxRetries}): ${error.message}，${backoffMs}ms 后重试`);
                await this.delay(backoffMs);
            }
        }
        throw lastError || new Error('未知错误');
    }
    normalizePlaceName(name) {
        const replacements = {
            'ý': 'y', 'Ý': 'Y',
            'á': 'a', 'Á': 'A',
            'é': 'e', 'É': 'E',
            'í': 'i', 'Í': 'I',
            'ó': 'o', 'Ó': 'O',
            'ú': 'u', 'Ú': 'U',
            'ð': 'd', 'Ð': 'D',
            'þ': 'th', 'Þ': 'Th',
            'ö': 'o', 'Ö': 'O',
            'ä': 'a', 'Ä': 'A',
            'ü': 'u', 'Ü': 'U',
        };
        let normalized = name;
        for (const [special, replacement] of Object.entries(replacements)) {
            normalized = normalized.replace(new RegExp(special, 'g'), replacement);
        }
        return normalized.trim().replace(/\s+/g, ' ');
    }
    getCountryName(countryCode) {
        const countryMap = {
            'IS': 'Iceland',
            'US': 'United States',
            'GB': 'United Kingdom',
            'FR': 'France',
            'DE': 'Germany',
            'IT': 'Italy',
            'ES': 'Spain',
            'CN': 'China',
            'JP': 'Japan',
            'KR': 'South Korea',
            'AU': 'Australia',
            'CA': 'Canada',
            'MX': 'Mexico',
            'BR': 'Brazil',
            'IN': 'India',
            'TH': 'Thailand',
            'VN': 'Vietnam',
            'ID': 'Indonesia',
            'MY': 'Malaysia',
            'SG': 'Singapore',
            'PH': 'Philippines',
        };
        return countryMap[countryCode.toUpperCase()] || countryCode;
    }
    buildSearchQuery(place, simplified = false) {
        const parts = [];
        let placeName = '';
        if (place.placeNameEn) {
            placeName = this.normalizePlaceName(place.placeNameEn);
        }
        else {
            placeName = this.normalizePlaceName(place.placeName);
        }
        if (simplified) {
            const descriptiveWords = ['nature baths', 'nature bath', 'baths', 'bath', 'hot spring', 'hot springs'];
            let simplifiedName = placeName.toLowerCase();
            for (const word of descriptiveWords) {
                simplifiedName = simplifiedName.replace(new RegExp(`\\b${word}\\b`, 'gi'), '').trim();
            }
            parts.push(simplifiedName || placeName);
        }
        else {
            parts.push(placeName);
        }
        if (place.country) {
            const countryName = this.getCountryName(place.country);
            if (countryName !== place.country) {
                parts.push(countryName);
            }
            else {
                parts.push(place.country);
            }
        }
        if (!simplified && place.category) {
            const categoryKeywords = {
                landmark: 'landmark travel',
                nature: 'nature landscape scenic',
                restaurant: 'restaurant food',
                hotel: 'hotel building',
                temple: 'temple architecture',
                museum: 'museum architecture',
                park: 'park nature',
                beach: 'beach ocean',
                mountain: 'mountain landscape',
            };
            if (categoryKeywords[place.category]) {
                parts.push(categoryKeywords[place.category]);
            }
        }
        return parts.join(' ');
    }
    transformPhoto(raw) {
        return {
            id: raw.id,
            width: raw.width,
            height: raw.height,
            color: raw.color,
            blurHash: raw.blur_hash || '',
            description: raw.description,
            altDescription: raw.alt_description,
            urls: {
                raw: raw.urls.raw,
                full: raw.urls.full,
                regular: raw.urls.regular,
                small: raw.urls.small,
                thumb: raw.urls.thumb,
            },
            links: {
                html: raw.links.html,
                download: raw.links.download_location,
            },
            user: {
                name: raw.user.name,
                username: raw.user.username,
                link: raw.user.links.html,
            },
            attribution: {
                photographerName: raw.user.name,
                photographerUrl: raw.user.links.html,
                unsplashUrl: raw.links.html,
            },
        };
    }
    buildCacheKey(place) {
        const name = place.placeNameEn || place.placeName;
        const country = place.country || '';
        return `unsplash:${name}:${country}`.toLowerCase().replace(/\s+/g, '_');
    }
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
            return cached.photo;
        }
        if (cached) {
            this.cache.delete(key);
        }
        return null;
    }
    setCache(key, photo) {
        this.cache.set(key, { photo, timestamp: Date.now() });
        if (this.cache.size > 1000) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }
    }
    checkRateLimit() {
        const now = Date.now();
        if (now - this.lastResetTime > 60 * 60 * 1000) {
            this.requestCount = 0;
            this.lastResetTime = now;
        }
        if (this.requestCount >= this.MAX_REQUESTS_PER_HOUR) {
            return false;
        }
        this.requestCount++;
        return true;
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    getCacheStats() {
        return {
            size: this.cache.size,
            ttlMs: this.CACHE_TTL_MS,
        };
    }
    clearCache() {
        this.cache.clear();
        this.logger.log('缓存已清除');
    }
};
exports.UnsplashService = UnsplashService;
exports.UnsplashService = UnsplashService = UnsplashService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], UnsplashService);
//# sourceMappingURL=unsplash.service.js.map