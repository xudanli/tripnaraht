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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ImageDirectService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageDirectService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const axios_1 = __importDefault(require("axios"));
const https = __importStar(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
let ImageDirectService = ImageDirectService_1 = class ImageDirectService {
    constructor(configService, prisma) {
        this.configService = configService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(ImageDirectService_1.name);
        this.pexelsApiKey = null;
        this.unsplashApiKey = null;
        this.isAvailable = false;
        this.pexelsBaseUrl = 'https://api.pexels.com/v1';
        this.unsplashBaseUrl = 'https://api.unsplash.com';
        this.pexelsApiKey =
            this.configService.get('PEXELS_API_KEY') ||
                process.env.PEXELS_API_KEY ||
                null;
        this.unsplashApiKey =
            this.configService.get('UNSPLASH_ACCESS_KEY') ||
                this.configService.get('UNSPLASH_API_KEY') ||
                process.env.UNSPLASH_ACCESS_KEY ||
                process.env.UNSPLASH_API_KEY ||
                null;
    }
    async onModuleInit() {
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
            timeout: 30000,
            httpsAgent,
            proxy: false,
            headers: {
                'User-Agent': 'TripNARA/1.0',
            },
        });
        if (this.pexelsApiKey) {
            try {
                const testResponse = await this.axiosInstance.get(`${this.pexelsBaseUrl}/search`, {
                    params: {
                        query: 'nature',
                        per_page: 1,
                    },
                    headers: {
                        'Authorization': this.pexelsApiKey,
                    },
                });
                if (testResponse.data && testResponse.data.photos) {
                    this.isAvailable = true;
                    this.logger.log('Image Direct Service initialized (Pexels API)');
                }
                else {
                    this.logger.warn('Pexels API test returned unexpected format');
                    this.isAvailable = false;
                }
            }
            catch (error) {
                this.logger.warn('Failed to initialize with Pexels API:', error.message);
                if (this.unsplashApiKey) {
                    try {
                        const unsplashTest = await this.axiosInstance.get(`${this.unsplashBaseUrl}/search/photos`, {
                            params: {
                                query: 'nature',
                                per_page: 1,
                            },
                            headers: {
                                'Authorization': `Client-ID ${this.unsplashApiKey}`,
                            },
                        });
                        if (unsplashTest.data && unsplashTest.data.results) {
                            this.isAvailable = true;
                            this.logger.log('Image Direct Service initialized (Unsplash API)');
                        }
                    }
                    catch (unsplashError) {
                        this.logger.error('Failed to initialize with Unsplash API:', unsplashError.message);
                        this.isAvailable = false;
                    }
                }
                else {
                    this.isAvailable = false;
                }
            }
        }
        else if (this.unsplashApiKey) {
            try {
                const testResponse = await this.axiosInstance.get(`${this.unsplashBaseUrl}/search/photos`, {
                    params: {
                        query: 'nature',
                        per_page: 1,
                    },
                    headers: {
                        'Authorization': `Client-ID ${this.unsplashApiKey}`,
                    },
                });
                if (testResponse.data && testResponse.data.results) {
                    this.isAvailable = true;
                    this.logger.log('Image Direct Service initialized (Unsplash API)');
                }
                else {
                    this.logger.warn('Unsplash API test returned unexpected format');
                    this.isAvailable = false;
                }
            }
            catch (error) {
                this.logger.error('Failed to initialize Image Direct Service:', error.message);
                this.isAvailable = false;
            }
        }
        else {
            this.logger.warn('Pexels API Key or Unsplash API Key not found. Service will not be available.');
            this.isAvailable = false;
        }
    }
    async onModuleDestroy() {
        this.logger.log('Image Direct Service destroyed');
    }
    isServiceAvailable() {
        return this.isAvailable && (!!this.pexelsApiKey || !!this.unsplashApiKey);
    }
    async searchImages(params) {
        if (!this.isServiceAvailable()) {
            throw new Error('Pexels API Key or Unsplash API Key not configured');
        }
        if (this.pexelsApiKey) {
            try {
                return await this.searchWithPexels(params);
            }
            catch (error) {
                this.logger.warn('Pexels API failed, trying Unsplash:', error.message);
                if (this.unsplashApiKey) {
                    return await this.searchWithUnsplash(params);
                }
                throw error;
            }
        }
        else if (this.unsplashApiKey) {
            return await this.searchWithUnsplash(params);
        }
        else {
            throw new Error('No image API key configured');
        }
    }
    async searchWithPexels(params) {
        const requestParams = {
            query: params.query,
            per_page: params.perPage || 15,
            page: params.page || 1,
        };
        if (params.orientation) {
            requestParams.orientation = params.orientation;
        }
        if (params.size) {
            requestParams.size = params.size;
        }
        if (params.color) {
            requestParams.color = params.color.replace('#', '');
        }
        if (params.locale) {
            requestParams.locale = params.locale;
        }
        const response = await this.axiosInstance.get(`${this.pexelsBaseUrl}/search`, {
            params: requestParams,
            headers: {
                'Authorization': this.pexelsApiKey,
            },
        });
        if (!response.data || !response.data.photos) {
            throw new Error('Invalid response from Pexels API');
        }
        return {
            page: response.data.page,
            perPage: response.data.per_page,
            totalResults: response.data.total_results,
            totalPages: response.data.total_results ? Math.ceil(response.data.total_results / response.data.per_page) : 0,
            photos: response.data.photos.map((photo) => this.mapPexelsPhotoToImageDetails(photo)),
        };
    }
    async searchWithUnsplash(params) {
        const requestParams = {
            query: params.query,
            per_page: params.perPage || 15,
            page: params.page || 1,
        };
        if (params.orientation) {
            requestParams.orientation = params.orientation;
        }
        if (params.color) {
            requestParams.color = params.color.replace('#', '');
        }
        const response = await this.axiosInstance.get(`${this.unsplashBaseUrl}/search/photos`, {
            params: requestParams,
            headers: {
                'Authorization': `Client-ID ${this.unsplashApiKey}`,
            },
        });
        if (!response.data || !response.data.results) {
            throw new Error('Invalid response from Unsplash API');
        }
        const totalResults = response.data.total || response.data.results.length;
        const perPage = params.perPage || 15;
        return {
            page: params.page || 1,
            perPage,
            totalResults,
            totalPages: Math.ceil(totalResults / perPage),
            photos: response.data.results.map((photo) => this.mapUnsplashPhotoToImageDetails(photo)),
        };
    }
    async getImageDetails(photoId, source = 'pexels') {
        if (!this.isServiceAvailable()) {
            throw new Error('Pexels API Key or Unsplash API Key not configured');
        }
        try {
            if (source === 'pexels' && this.pexelsApiKey) {
                const response = await this.axiosInstance.get(`${this.pexelsBaseUrl}/photos/${photoId}`, {
                    headers: {
                        'Authorization': this.pexelsApiKey,
                    },
                });
                if (response.data) {
                    return this.mapPexelsPhotoToImageDetails(response.data);
                }
            }
            else if (source === 'unsplash' && this.unsplashApiKey) {
                const response = await this.axiosInstance.get(`${this.unsplashBaseUrl}/photos/${photoId}`, {
                    headers: {
                        'Authorization': `Client-ID ${this.unsplashApiKey}`,
                    },
                });
                if (response.data) {
                    return this.mapUnsplashPhotoToImageDetails(response.data);
                }
            }
        }
        catch (error) {
            this.logger.error('Failed to get image details:', error.message);
            return null;
        }
        return null;
    }
    async getCuratedPhotos(params = {}) {
        if (!this.isServiceAvailable()) {
            throw new Error('Pexels API Key or Unsplash API Key not configured');
        }
        if (this.pexelsApiKey) {
            try {
                const response = await this.axiosInstance.get(`${this.pexelsBaseUrl}/curated`, {
                    params: {
                        per_page: params.perPage || 15,
                        page: params.page || 1,
                    },
                    headers: {
                        'Authorization': this.pexelsApiKey,
                    },
                });
                if (response.data && response.data.photos) {
                    return {
                        page: response.data.page,
                        perPage: response.data.per_page,
                        totalResults: response.data.photos.length,
                        totalPages: 1,
                        photos: response.data.photos.map((photo) => this.mapPexelsPhotoToImageDetails(photo)),
                    };
                }
            }
            catch (error) {
                this.logger.warn('Failed to get curated photos from Pexels:', error.message);
            }
        }
        if (this.unsplashApiKey) {
            return await this.searchWithUnsplash({
                query: 'travel',
                perPage: params.perPage || 15,
                page: params.page || 1,
            });
        }
        throw new Error('No image API available');
    }
    async getUserImagePreferences(userId) {
        try {
            const preferences = await this.prisma.imagePreferences.findUnique({
                where: { userId },
            });
            if (!preferences) {
                return null;
            }
            return {
                preferredStyles: preferences.preferredStyles || [],
                preferredColors: preferences.preferredColors || [],
                preferredOrientations: preferences.preferredOrientations || [],
                favoriteImages: preferences.favoriteImages || [],
            };
        }
        catch (error) {
            this.logger.error('Failed to get user image preferences:', error.message);
            throw error;
        }
    }
    async saveUserImagePreferences(userId, preferences) {
        try {
            await this.prisma.imagePreferences.upsert({
                where: { userId },
                create: {
                    userId,
                    preferredStyles: preferences.preferredStyles || [],
                    preferredColors: preferences.preferredColors || [],
                    preferredOrientations: preferences.preferredOrientations || [],
                    favoriteImages: preferences.favoriteImages || [],
                },
                update: {
                    preferredStyles: preferences.preferredStyles,
                    preferredColors: preferences.preferredColors,
                    preferredOrientations: preferences.preferredOrientations,
                    favoriteImages: preferences.favoriteImages,
                    updatedAt: new Date(),
                },
            });
        }
        catch (error) {
            this.logger.error('Failed to save user image preferences:', error.message);
            throw error;
        }
    }
    async recommendImages(userId, context) {
        if (!this.isServiceAvailable()) {
            throw new Error('Pexels API Key or Unsplash API Key not configured');
        }
        try {
            const userPrefs = await this.getUserImagePreferences(userId);
            const searchParams = {
                query: context.query || 'travel',
                perPage: context.perPage || 15,
                page: context.page || 1,
            };
            if (userPrefs) {
                if (userPrefs.preferredOrientations.length > 0) {
                    searchParams.orientation = userPrefs.preferredOrientations[0];
                }
                if (userPrefs.preferredColors.length > 0) {
                    searchParams.color = userPrefs.preferredColors[0];
                }
            }
            const result = await this.searchImages(searchParams);
            return result;
        }
        catch (error) {
            this.logger.error('Failed to recommend images:', error.message);
            throw error;
        }
    }
    mapPexelsPhotoToImageDetails(photo) {
        return {
            id: photo.id,
            width: photo.width,
            height: photo.height,
            url: photo.url,
            photographer: photo.photographer,
            photographerUrl: photo.photographer_url,
            photographerId: photo.photographer_id,
            avgColor: photo.avg_color || '#000000',
            src: {
                original: photo.src.original,
                large2x: photo.src.large2x,
                large: photo.src.large,
                medium: photo.src.medium,
                small: photo.src.small,
                portrait: photo.src.portrait,
                landscape: photo.src.landscape,
                tiny: photo.src.tiny,
            },
            liked: photo.liked || false,
            alt: photo.alt || '',
        };
    }
    mapUnsplashPhotoToImageDetails(photo) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        return {
            id: photo.id,
            width: photo.width,
            height: photo.height,
            url: ((_a = photo.links) === null || _a === void 0 ? void 0 : _a.html) || photo.url || '',
            photographer: ((_b = photo.user) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown',
            photographerUrl: ((_d = (_c = photo.user) === null || _c === void 0 ? void 0 : _c.links) === null || _d === void 0 ? void 0 : _d.html) || '',
            photographerId: ((_e = photo.user) === null || _e === void 0 ? void 0 : _e.id) || 0,
            avgColor: photo.color || '#000000',
            src: {
                original: ((_f = photo.urls) === null || _f === void 0 ? void 0 : _f.full) || ((_g = photo.urls) === null || _g === void 0 ? void 0 : _g.raw) || '',
                large2x: ((_h = photo.urls) === null || _h === void 0 ? void 0 : _h.full) || '',
                large: ((_j = photo.urls) === null || _j === void 0 ? void 0 : _j.regular) || '',
                medium: ((_k = photo.urls) === null || _k === void 0 ? void 0 : _k.small) || '',
                small: ((_l = photo.urls) === null || _l === void 0 ? void 0 : _l.thumb) || '',
                portrait: ((_m = photo.urls) === null || _m === void 0 ? void 0 : _m.regular) || '',
                landscape: ((_o = photo.urls) === null || _o === void 0 ? void 0 : _o.regular) || '',
                tiny: ((_p = photo.urls) === null || _p === void 0 ? void 0 : _p.thumb) || '',
            },
            liked: photo.liked_by_user || false,
            alt: photo.description || photo.alt_description || '',
        };
    }
};
exports.ImageDirectService = ImageDirectService;
exports.ImageDirectService = ImageDirectService = ImageDirectService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], ImageDirectService);
//# sourceMappingURL=image-direct.service.js.map