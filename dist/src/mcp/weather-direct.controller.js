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
exports.WeatherDirectController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const weather_direct_service_1 = require("./weather-direct.service");
let WeatherDirectController = class WeatherDirectController {
    constructor(weatherDirectService) {
        this.weatherDirectService = weatherDirectService;
    }
    health() {
        return {
            status: 'ok',
            service: 'Weather Direct Service',
            available: this.weatherDirectService.isServiceAvailable(),
            api: 'Open-Meteo API',
        };
    }
    async getCurrentWeather(city) {
        if (!city) {
            return { error: 'City parameter is required' };
        }
        return await this.weatherDirectService.getCurrentWeather(city);
    }
    async getWeatherByDatetimeRange(city, startDate, endDate) {
        if (!city || !startDate || !endDate) {
            return { error: 'City, start_date, and end_date parameters are required' };
        }
        return await this.weatherDirectService.getWeatherByDatetimeRange(city, startDate, endDate);
    }
    async getCurrentDateTime(timezone) {
        return await this.weatherDirectService.getCurrentDateTime(timezone);
    }
};
exports.WeatherDirectController = WeatherDirectController;
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WeatherDirectController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('current'),
    (0, swagger_1.ApiOperation)({ summary: '获取当前天气' }),
    (0, swagger_1.ApiQuery)({ name: 'city', description: '城市名称', example: 'New York' }),
    __param(0, (0, common_1.Query)('city')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WeatherDirectController.prototype, "getCurrentWeather", null);
__decorate([
    (0, common_1.Get)('forecast'),
    (0, swagger_1.ApiOperation)({ summary: '获取天气预报' }),
    (0, swagger_1.ApiQuery)({ name: 'city', description: '城市名称', example: 'Tokyo' }),
    (0, swagger_1.ApiQuery)({ name: 'start_date', description: '开始日期 (YYYY-MM-DD)', example: '2026-02-07' }),
    (0, swagger_1.ApiQuery)({ name: 'end_date', description: '结束日期 (YYYY-MM-DD)', example: '2026-02-10' }),
    __param(0, (0, common_1.Query)('city')),
    __param(1, (0, common_1.Query)('start_date')),
    __param(2, (0, common_1.Query)('end_date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], WeatherDirectController.prototype, "getWeatherByDatetimeRange", null);
__decorate([
    (0, common_1.Get)('datetime'),
    (0, swagger_1.ApiOperation)({ summary: '获取当前日期时间' }),
    (0, swagger_1.ApiQuery)({ name: 'timezone', description: '时区', example: 'Asia/Shanghai', required: false }),
    __param(0, (0, common_1.Query)('timezone')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WeatherDirectController.prototype, "getCurrentDateTime", null);
exports.WeatherDirectController = WeatherDirectController = __decorate([
    (0, swagger_1.ApiTags)('Weather Direct'),
    (0, common_1.Controller)('api/weather-direct'),
    __metadata("design:paramtypes", [weather_direct_service_1.WeatherDirectService])
], WeatherDirectController);
//# sourceMappingURL=weather-direct.controller.js.map