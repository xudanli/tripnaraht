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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDifficultyResponseDto = exports.RouteDifficultyRequestDto = exports.RouteProfile = exports.RouteProvider = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var RouteProvider;
(function (RouteProvider) {
    RouteProvider["GOOGLE"] = "google";
    RouteProvider["MAPBOX"] = "mapbox";
})(RouteProvider || (exports.RouteProvider = RouteProvider = {}));
var RouteProfile;
(function (RouteProfile) {
    RouteProfile["WALKING"] = "walking";
    RouteProfile["DRIVING"] = "driving";
    RouteProfile["BICYCLING"] = "bicycling";
    RouteProfile["CYCLING"] = "cycling";
    RouteProfile["TRANSIT"] = "transit";
})(RouteProfile || (exports.RouteProfile = RouteProfile = {}));
class RouteDifficultyRequestDto {
    constructor() {
        this.profile = RouteProfile.WALKING;
        this.sampleM = 30;
        this.z = 14;
        this.workers = 8;
        this.includeGeoJson = false;
        this.includeGpx = false;
    }
}
exports.RouteDifficultyRequestDto = RouteDifficultyRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '数据源提供商',
        enum: RouteProvider,
        example: 'google',
    }),
    (0, class_validator_1.IsEnum)(RouteProvider),
    __metadata("design:type", String)
], RouteDifficultyRequestDto.prototype, "provider", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '起点坐标（格式：lat,lon 或 lon,lat，Mapbox使用后者）',
        example: '39.9042,116.4074',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RouteDifficultyRequestDto.prototype, "origin", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '终点坐标（格式：lat,lon 或 lon,lat，Mapbox使用后者）',
        example: '39.914,116.403',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RouteDifficultyRequestDto.prototype, "destination", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '路线模式',
        enum: RouteProfile,
        default: 'walking',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(RouteProfile),
    __metadata("design:type", String)
], RouteDifficultyRequestDto.prototype, "profile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '采样间隔（米）',
        default: 30,
        minimum: 10,
        maximum: 100,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(10),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], RouteDifficultyRequestDto.prototype, "sampleM", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '类别（如 ATTRACTION, RESTAURANT）',
        example: 'ATTRACTION',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RouteDifficultyRequestDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '访问方式（如 HIKING, VEHICLE, CABLE_CAR）',
        example: 'HIKING',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RouteDifficultyRequestDto.prototype, "accessType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '访问时长（如 "半天", "2小时", "1天"）',
        example: '半天',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RouteDifficultyRequestDto.prototype, "visitDuration", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '典型停留时间',
        example: '2小时',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RouteDifficultyRequestDto.prototype, "typicalStay", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '海拔（米）',
        example: 2300,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RouteDifficultyRequestDto.prototype, "elevationMeters", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '纬度（用于高海拔地区判断，范围-90到90）',
        example: 39.9042,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(-90),
    (0, class_validator_1.Max)(90),
    __metadata("design:type", Number)
], RouteDifficultyRequestDto.prototype, "latitude", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否有高海拔适应（是否在高海拔过夜或最近3天平均睡眠海拔≥2500m）',
        example: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], RouteDifficultyRequestDto.prototype, "hasAcclimatization", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '最近3天平均睡眠海拔（米）',
        example: 2000,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RouteDifficultyRequestDto.prototype, "avgSleepElevation", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '暴露时间（小时，用于判断超长暴露）',
        example: 6,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RouteDifficultyRequestDto.prototype, "exposureHours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '体感温度（摄氏度，用于判断极寒条件）',
        example: -5,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RouteDifficultyRequestDto.prototype, "feelsLikeTemp", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '极寒持续时间（小时，体感温度<-10℃的持续时间）',
        example: 2,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RouteDifficultyRequestDto.prototype, "coldDurationHours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '背负重量（公斤，用于判断高背负）',
        example: 10,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RouteDifficultyRequestDto.prototype, "loadWeightKg", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '子类别（如 glacier, volcano）',
        example: 'volcano',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RouteDifficultyRequestDto.prototype, "subCategory", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '官方难度评级（最高优先级）',
        enum: ['EASY', 'MODERATE', 'HARD', 'EXTREME'],
        example: 'HARD',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['EASY', 'MODERATE', 'HARD', 'EXTREME']),
    __metadata("design:type", String)
], RouteDifficultyRequestDto.prototype, "trailDifficulty", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Mapbox缩放级别（仅Mapbox使用，默认14）',
        default: 14,
        minimum: 10,
        maximum: 16,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(10),
    (0, class_validator_1.Max)(16),
    __metadata("design:type", Number)
], RouteDifficultyRequestDto.prototype, "z", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Mapbox并发下载线程数（仅Mapbox使用，默认8）',
        default: 8,
        minimum: 1,
        maximum: 16,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(16),
    __metadata("design:type", Number)
], RouteDifficultyRequestDto.prototype, "workers", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Place ID（如果提供，将优先使用Place表中的数据，如length、elevationGain等）',
        example: 28497,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RouteDifficultyRequestDto.prototype, "placeId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否返回GeoJSON',
        default: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], RouteDifficultyRequestDto.prototype, "includeGeoJson", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否返回GPX',
        default: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], RouteDifficultyRequestDto.prototype, "includeGpx", void 0);
class RouteDifficultyResponseDto {
}
exports.RouteDifficultyResponseDto = RouteDifficultyResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '距离（公里）', example: 10.8 }),
    __metadata("design:type", Number)
], RouteDifficultyResponseDto.prototype, "distance_km", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '累计爬升（米）', example: 720 }),
    __metadata("design:type", Number)
], RouteDifficultyResponseDto.prototype, "elevation_gain_m", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '平均坡度（0-1之间）', example: 0.067 }),
    __metadata("design:type", Number)
], RouteDifficultyResponseDto.prototype, "slope_avg", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '难度等级', enum: ['EASY', 'MODERATE', 'HARD', 'EXTREME'], example: 'HARD' }),
    __metadata("design:type", String)
], RouteDifficultyResponseDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '等效强度距离（公里）', example: 18.0 }),
    __metadata("design:type", Number)
], RouteDifficultyResponseDto.prototype, "S_km", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '说明列表', example: ['altitude: ×1.3', 'slope: bump one level (≥15%)'] }),
    __metadata("design:type", Array)
], RouteDifficultyResponseDto.prototype, "notes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'GeoJSON（如果请求时includeGeoJson=true）' }),
    __metadata("design:type", Object)
], RouteDifficultyResponseDto.prototype, "geojson", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'GPX XML字符串（如果请求时includeGpx=true）' }),
    __metadata("design:type", String)
], RouteDifficultyResponseDto.prototype, "gpx", void 0);
//# sourceMappingURL=route-difficulty.dto.js.map