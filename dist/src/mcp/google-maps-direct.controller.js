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
exports.GoogleMapsDirectController = void 0;
const common_1 = require("@nestjs/common");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const google_maps_direct_service_1 = require("./google-maps-direct.service");
let GoogleMapsDirectController = class GoogleMapsDirectController {
    constructor(googleMapsService) {
        this.googleMapsService = googleMapsService;
    }
    async health() {
        return {
            success: true,
            available: this.googleMapsService.isServiceAvailable(),
        };
    }
    async getRoute(body) {
        try {
            const result = await this.googleMapsService.getRoute(body);
            return result;
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'GOOGLE_MAPS_ERROR',
                    message: error.message || 'Failed to get route',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async computeDistanceMatrix(body) {
        try {
            const result = await this.googleMapsService.computeDistanceMatrix(body);
            return result;
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'GOOGLE_MAPS_ERROR',
                    message: error.message || 'Failed to compute distance matrix',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async geocode(body) {
        try {
            const result = await this.googleMapsService.geocode(body);
            return result;
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'GOOGLE_MAPS_ERROR',
                    message: error.message || 'Failed to geocode',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async searchPlaces(body) {
        try {
            const result = await this.googleMapsService.searchPlaces(body);
            return result;
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'GOOGLE_MAPS_ERROR',
                    message: error.message || 'Failed to search places',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async nearbySearch(body) {
        try {
            const result = await this.googleMapsService.nearbySearch(body);
            return result;
        }
        catch (error) {
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'GOOGLE_MAPS_ERROR',
                    message: error.message || 'Failed to search nearby',
                },
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.GoogleMapsDirectController = GoogleMapsDirectController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GoogleMapsDirectController.prototype, "health", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('route'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GoogleMapsDirectController.prototype, "getRoute", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('distance-matrix'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GoogleMapsDirectController.prototype, "computeDistanceMatrix", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('geocode'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GoogleMapsDirectController.prototype, "geocode", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('search-places'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GoogleMapsDirectController.prototype, "searchPlaces", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('nearby-search'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GoogleMapsDirectController.prototype, "nearbySearch", null);
exports.GoogleMapsDirectController = GoogleMapsDirectController = __decorate([
    (0, common_1.Controller)('api/google-maps-direct'),
    __metadata("design:paramtypes", [google_maps_direct_service_1.GoogleMapsDirectService])
], GoogleMapsDirectController);
//# sourceMappingURL=google-maps-direct.controller.js.map