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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotelDirectController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const hotel_direct_service_1 = require("./hotel-direct.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
let HotelDirectController = class HotelDirectController {
    constructor(hotelService) {
        this.hotelService = hotelService;
    }
    async health() {
        return {
            success: true,
            available: this.hotelService.isServiceAvailable(),
        };
    }
    async searchHotels(user, body) {
        try {
            const result = await this.hotelService.searchHotels(body);
            return {
                success: true,
                ...result,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'HOTEL_ERROR',
                    message: error.message || 'Failed to search hotels',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getHotelDetails(placeId, language) {
        try {
            const details = await this.hotelService.getHotelDetails(placeId, language);
            if (!details) {
                throw new common_1.HttpException({
                    success: false,
                    error: {
                        code: 'HOTEL_NOT_FOUND',
                        message: 'Hotel not found',
                    },
                }, common_1.HttpStatus.NOT_FOUND);
            }
            return {
                success: true,
                hotel: details,
            };
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'HOTEL_ERROR',
                    message: error.message || 'Failed to get hotel details',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async nearbySearch(lat, lng, radius, type, keyword, priceLevel, minRating, language) {
        try {
            const location = {
                lat: parseFloat(lat),
                lng: parseFloat(lng),
            };
            if (isNaN(location.lat) || isNaN(location.lng)) {
                throw new common_1.HttpException({
                    success: false,
                    error: {
                        code: 'INVALID_PARAMS',
                        message: 'Invalid latitude or longitude',
                    },
                }, common_1.HttpStatus.BAD_REQUEST);
            }
            const results = await this.hotelService.nearbySearch({
                location,
                radius: radius ? parseInt(radius) : undefined,
                type,
                keyword,
                priceLevel: priceLevel ? parseInt(priceLevel) : undefined,
                minRating: minRating ? parseFloat(minRating) : undefined,
                language,
            });
            return {
                success: true,
                results,
                count: results.length,
            };
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'HOTEL_ERROR',
                    message: error.message || 'Failed to search nearby hotels',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getUserPreferences(user) {
        try {
            const preferences = await this.hotelService.getUserPreferences(user.id);
            return {
                success: true,
                preferences: preferences || {
                    hotelType: [],
                    priceRange: 'medium',
                    amenities: [],
                    favoriteHotels: [],
                },
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'HOTEL_ERROR',
                    message: error.message || 'Failed to get user preferences',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async saveUserPreferences(user, body) {
        try {
            await this.hotelService.saveUserPreferences(user.id, body);
            return {
                success: true,
                message: 'Preferences saved successfully',
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'HOTEL_ERROR',
                    message: error.message || 'Failed to save user preferences',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async recommendHotels(user, body) {
        try {
            const context = {
                location: body.location,
                checkIn: body.checkIn,
                checkOut: body.checkOut,
                guests: body.guests,
                radius: body.radius,
            };
            const recommendations = await this.hotelService.recommendHotels(user.id, context);
            return {
                success: true,
                recommendations,
                count: recommendations.length,
            };
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'HOTEL_ERROR',
                    message: error.message || 'Failed to recommend hotels',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.HotelDirectController = HotelDirectController;
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '检查 Hotel 服务状态' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '服务状态' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HotelDirectController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('search'),
    (0, swagger_1.ApiOperation)({ summary: '搜索酒店' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '酒店搜索结果' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], HotelDirectController.prototype, "searchHotels", null);
__decorate([
    (0, common_1.Get)('details/:placeId'),
    (0, swagger_1.ApiOperation)({ summary: '获取酒店详情' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '酒店详情' }),
    __param(0, (0, common_1.Param)('placeId')),
    __param(1, (0, common_1.Query)('language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], HotelDirectController.prototype, "getHotelDetails", null);
__decorate([
    (0, common_1.Get)('nearby'),
    (0, swagger_1.ApiOperation)({ summary: '附近搜索酒店' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '附近酒店列表' }),
    __param(0, (0, common_1.Query)('lat')),
    __param(1, (0, common_1.Query)('lng')),
    __param(2, (0, common_1.Query)('radius')),
    __param(3, (0, common_1.Query)('type')),
    __param(4, (0, common_1.Query)('keyword')),
    __param(5, (0, common_1.Query)('priceLevel')),
    __param(6, (0, common_1.Query)('minRating')),
    __param(7, (0, common_1.Query)('language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], HotelDirectController.prototype, "nearbySearch", null);
__decorate([
    (0, common_1.Get)('preferences'),
    (0, swagger_1.ApiOperation)({ summary: '获取用户酒店偏好' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '用户偏好' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], HotelDirectController.prototype, "getUserPreferences", null);
__decorate([
    (0, common_1.Post)('preferences'),
    (0, swagger_1.ApiOperation)({ summary: '保存用户酒店偏好' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '偏好保存成功' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], HotelDirectController.prototype, "saveUserPreferences", null);
__decorate([
    (0, common_1.Post)('recommend'),
    (0, swagger_1.ApiOperation)({ summary: '智能推荐酒店（基于用户偏好和上下文）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '推荐酒店列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], HotelDirectController.prototype, "recommendHotels", null);
exports.HotelDirectController = HotelDirectController = __decorate([
    (0, swagger_1.ApiTags)('hotel'),
    (0, common_1.Controller)('api/hotel'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [hotel_direct_service_1.HotelDirectService])
], HotelDirectController);
//# sourceMappingURL=hotel-direct.controller.js.map