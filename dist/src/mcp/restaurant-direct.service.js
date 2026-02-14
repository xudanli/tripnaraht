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
var RestaurantDirectService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestaurantDirectService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const axios_1 = __importDefault(require("axios"));
const https = __importStar(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
let RestaurantDirectService = RestaurantDirectService_1 = class RestaurantDirectService {
    constructor(configService, prisma) {
        this.configService = configService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(RestaurantDirectService_1.name);
        this.apiKey = null;
        this.isAvailable = false;
        this.baseUrl = 'https://maps.googleapis.com/maps/api/place';
        this.apiKey =
            this.configService.get('GOOGLE_MAPS_API_KEY') ||
                this.configService.get('GOOGLE_PLACES_API_KEY') ||
                process.env.GOOGLE_MAPS_API_KEY ||
                process.env.GOOGLE_PLACES_API_KEY ||
                null;
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
                timeout: 30000,
                httpsAgent,
                proxy: false,
                headers: {
                    'User-Agent': 'TripNARA/1.0',
                },
            });
            try {
                const testResponse = await this.axiosInstance.get('/textsearch/json', {
                    params: {
                        query: 'restaurant',
                        key: this.apiKey,
                        type: 'restaurant',
                    },
                });
                if (testResponse.data.status === 'OK' || testResponse.data.status === 'ZERO_RESULTS') {
                    this.isAvailable = true;
                    this.logger.log('Restaurant Direct Service initialized');
                }
                else {
                    this.logger.warn(`Google Places API test returned: ${testResponse.data.status}`);
                    this.isAvailable = false;
                }
            }
            catch (error) {
                this.logger.error('Failed to initialize Restaurant Direct Service:', error.message);
                this.isAvailable = false;
            }
        }
        else {
            this.logger.warn('Google Maps/Places API Key not found. Service will not be available.');
            this.isAvailable = false;
        }
    }
    async onModuleDestroy() {
        this.logger.log('Restaurant Direct Service destroyed');
    }
    isServiceAvailable() {
        return this.isAvailable && !!this.apiKey;
    }
    async searchRestaurants(params) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Places API Key not configured');
        }
        try {
            const searchParams = {
                key: this.apiKey,
                language: params.language || 'en',
            };
            if (params.query) {
                searchParams.query = params.query;
            }
            else {
                searchParams.query = 'restaurant';
            }
            if (params.type) {
                searchParams.type = params.type;
            }
            else {
                searchParams.type = 'restaurant';
            }
            if (params.location) {
                searchParams.location = `${params.location.lat},${params.location.lng}`;
                searchParams.radius = params.radius || 5000;
            }
            const response = await this.axiosInstance.get('/textsearch/json', {
                params: searchParams,
            });
            if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
                throw new Error(`Google Places API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
            }
            let results = (response.data.results || []).map((place) => this.mapPlaceToRestaurant(place));
            if (params.priceLevel) {
                results = results.filter((r) => r.priceLevel === params.priceLevel);
            }
            if (params.minRating) {
                results = results.filter((r) => r.rating && r.rating >= params.minRating);
            }
            if (params.openNow !== undefined) {
                results = results.filter((r) => { var _a; return ((_a = r.openingHours) === null || _a === void 0 ? void 0 : _a.openNow) === params.openNow; });
            }
            return {
                success: true,
                results,
                totalResults: results.length,
            };
        }
        catch (error) {
            this.logger.error('Failed to search restaurants:', error.message);
            throw error;
        }
    }
    async getRestaurantDetails(placeId, language) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Places API Key not configured');
        }
        try {
            const response = await this.axiosInstance.get('/details/json', {
                params: {
                    place_id: placeId,
                    key: this.apiKey,
                    language: language || 'en',
                    fields: [
                        'place_id',
                        'name',
                        'formatted_address',
                        'geometry',
                        'rating',
                        'user_ratings_total',
                        'price_level',
                        'types',
                        'opening_hours',
                        'photos',
                        'formatted_phone_number',
                        'website',
                        'reviews',
                        'international_phone_number',
                    ].join(','),
                },
            });
            if (response.data.status !== 'OK') {
                throw new Error(`Google Places API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
            }
            const place = response.data.result;
            return this.mapPlaceToRestaurant(place, true);
        }
        catch (error) {
            this.logger.error('Failed to get restaurant details:', error.message);
            throw error;
        }
    }
    async nearbySearch(params) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Places API Key not configured');
        }
        try {
            const searchParams = {
                location: `${params.location.lat},${params.location.lng}`,
                radius: params.radius || 5000,
                type: params.type || 'restaurant',
                key: this.apiKey,
                language: params.language || 'en',
            };
            if (params.keyword) {
                searchParams.keyword = params.keyword;
            }
            const response = await this.axiosInstance.get('/nearbysearch/json', {
                params: searchParams,
            });
            if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
                throw new Error(`Google Places API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
            }
            let results = (response.data.results || []).map((place) => this.mapPlaceToRestaurant(place));
            if (params.priceLevel) {
                results = results.filter((r) => r.priceLevel === params.priceLevel);
            }
            if (params.minRating) {
                results = results.filter((r) => r.rating && r.rating >= params.minRating);
            }
            if (params.openNow !== undefined) {
                results = results.filter((r) => { var _a; return ((_a = r.openingHours) === null || _a === void 0 ? void 0 : _a.openNow) === params.openNow; });
            }
            return results;
        }
        catch (error) {
            this.logger.error('Failed to search nearby restaurants:', error.message);
            throw error;
        }
    }
    async getUserPreferences(userId) {
        try {
            const preferences = await this.prisma.restaurantPreferences.findUnique({
                where: { userId },
            });
            if (!preferences) {
                return null;
            }
            return {
                cuisine: preferences.cuisine || [],
                priceRange: preferences.priceRange || 'medium',
                dietaryRestrictions: preferences.dietaryRestrictions || [],
                favoriteRestaurants: preferences.favoriteRestaurants || [],
            };
        }
        catch (error) {
            this.logger.error('Failed to get user preferences:', error.message);
            throw error;
        }
    }
    async saveUserPreferences(userId, preferences) {
        try {
            await this.prisma.restaurantPreferences.upsert({
                where: { userId },
                create: {
                    userId,
                    cuisine: preferences.cuisine || [],
                    priceRange: preferences.priceRange || 'medium',
                    dietaryRestrictions: preferences.dietaryRestrictions || [],
                    favoriteRestaurants: preferences.favoriteRestaurants || [],
                },
                update: {
                    cuisine: preferences.cuisine,
                    priceRange: preferences.priceRange,
                    dietaryRestrictions: preferences.dietaryRestrictions,
                    favoriteRestaurants: preferences.favoriteRestaurants,
                    updatedAt: new Date(),
                },
            });
        }
        catch (error) {
            this.logger.error('Failed to save user preferences:', error.message);
            throw error;
        }
    }
    async recommendRestaurants(userId, context) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Places API Key not configured');
        }
        try {
            const preferences = await this.getUserPreferences(userId);
            const searchParams = {
                location: context.location,
                radius: context.radius || 5000,
                language: 'en',
            };
            if (preferences) {
                if (preferences.cuisine.length > 0) {
                    searchParams.query = `${preferences.cuisine[0]} restaurant`;
                }
                if (preferences.priceRange) {
                    const priceMap = {
                        'low': 1,
                        'medium': 2,
                        'high': 3,
                        'very_high': 4,
                    };
                    searchParams.priceLevel = priceMap[preferences.priceRange] || 2;
                }
                searchParams.minRating = 4.0;
            }
            else {
                searchParams.query = 'restaurant';
                searchParams.minRating = 4.0;
            }
            if (context.time) {
                const now = new Date();
                const hours = now.getHours();
                if (hours >= 8 && hours < 22) {
                    searchParams.openNow = true;
                }
            }
            const result = await this.searchRestaurants(searchParams);
            return result.results.slice(0, 10);
        }
        catch (error) {
            this.logger.error('Failed to recommend restaurants:', error.message);
            throw error;
        }
    }
    mapPlaceToRestaurant(place, includeDetails = false) {
        var _a, _b, _c, _d, _e, _f, _g;
        const details = {
            placeId: place.place_id,
            name: place.name,
            address: place.formatted_address || place.vicinity || '',
            location: {
                lat: ((_b = (_a = place.geometry) === null || _a === void 0 ? void 0 : _a.location) === null || _b === void 0 ? void 0 : _b.lat) || 0,
                lng: ((_d = (_c = place.geometry) === null || _c === void 0 ? void 0 : _c.location) === null || _d === void 0 ? void 0 : _d.lng) || 0,
            },
            rating: place.rating,
            userRatingsTotal: place.user_ratings_total,
            priceLevel: place.price_level,
            types: place.types || [],
        };
        if (includeDetails) {
            details.phoneNumber = place.formatted_phone_number || place.international_phone_number;
            details.website = place.website;
            details.openingHours = place.opening_hours ? {
                openNow: place.opening_hours.open_now,
                weekdayText: place.opening_hours.weekday_text,
            } : undefined;
            details.photos = (_e = place.photos) === null || _e === void 0 ? void 0 : _e.map((photo) => ({
                photoReference: photo.photo_reference,
                width: photo.width,
                height: photo.height,
            }));
            details.reviews = (_f = place.reviews) === null || _f === void 0 ? void 0 : _f.map((review) => ({
                authorName: review.author_name,
                rating: review.rating,
                text: review.text,
                time: review.time,
            }));
        }
        const cuisineTypes = ((_g = place.types) === null || _g === void 0 ? void 0 : _g.filter((type) => type.includes('restaurant') ||
            type.includes('food') ||
            type.includes('meal'))) || [];
        details.cuisine = cuisineTypes;
        return details;
    }
};
exports.RestaurantDirectService = RestaurantDirectService;
exports.RestaurantDirectService = RestaurantDirectService = RestaurantDirectService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], RestaurantDirectService);
//# sourceMappingURL=restaurant-direct.service.js.map