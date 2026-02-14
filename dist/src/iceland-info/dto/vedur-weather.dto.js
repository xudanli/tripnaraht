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
exports.VedurWeatherResponseDto = exports.VedurWeatherForecastDto = exports.VedurWeatherStationDto = exports.VedurWeatherQueryDto = exports.HighlandRegion = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var HighlandRegion;
(function (HighlandRegion) {
    HighlandRegion["CENTRAL_HIGHLANDS"] = "centralhighlands";
    HighlandRegion["SOUTH_HIGHLANDS"] = "southhighlands";
    HighlandRegion["NORTH_HIGHLANDS"] = "northhighlands";
})(HighlandRegion || (exports.HighlandRegion = HighlandRegion = {}));
class VedurWeatherQueryDto {
}
exports.VedurWeatherQueryDto = VedurWeatherQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '高地区域',
        enum: HighlandRegion,
        example: HighlandRegion.CENTRAL_HIGHLANDS,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(HighlandRegion),
    __metadata("design:type", String)
], VedurWeatherQueryDto.prototype, "region", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '纬度',
        example: 64.5,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], VedurWeatherQueryDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '经度',
        example: -18.5,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], VedurWeatherQueryDto.prototype, "lng", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否包含详细风速信息',
        example: true,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], VedurWeatherQueryDto.prototype, "includeWindDetails", void 0);
class VedurWeatherStationDto {
}
exports.VedurWeatherStationDto = VedurWeatherStationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '气象站ID' }),
    __metadata("design:type", String)
], VedurWeatherStationDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '气象站名称' }),
    __metadata("design:type", String)
], VedurWeatherStationDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '纬度' }),
    __metadata("design:type", Number)
], VedurWeatherStationDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '经度' }),
    __metadata("design:type", Number)
], VedurWeatherStationDto.prototype, "lng", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '海拔（米）' }),
    __metadata("design:type", Number)
], VedurWeatherStationDto.prototype, "elevation", void 0);
class VedurWeatherForecastDto {
}
exports.VedurWeatherForecastDto = VedurWeatherForecastDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日期时间' }),
    __metadata("design:type", String)
], VedurWeatherForecastDto.prototype, "datetime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '温度（摄氏度）' }),
    __metadata("design:type", Number)
], VedurWeatherForecastDto.prototype, "temperature", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '风速（米/秒）' }),
    __metadata("design:type", Number)
], VedurWeatherForecastDto.prototype, "windSpeed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '风向（度）' }),
    __metadata("design:type", Number)
], VedurWeatherForecastDto.prototype, "windDirection", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '风速（公里/小时）' }),
    __metadata("design:type", Number)
], VedurWeatherForecastDto.prototype, "windSpeedKmh", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '降水概率（%）' }),
    __metadata("design:type", Number)
], VedurWeatherForecastDto.prototype, "precipitation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '天气状况描述' }),
    __metadata("design:type", String)
], VedurWeatherForecastDto.prototype, "condition", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '能见度（米）' }),
    __metadata("design:type", Number)
], VedurWeatherForecastDto.prototype, "visibility", void 0);
class VedurWeatherResponseDto {
}
exports.VedurWeatherResponseDto = VedurWeatherResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '气象站信息' }),
    __metadata("design:type", VedurWeatherStationDto)
], VedurWeatherResponseDto.prototype, "station", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '当前天气' }),
    __metadata("design:type", VedurWeatherForecastDto)
], VedurWeatherResponseDto.prototype, "current", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '预报列表（6天）', type: [VedurWeatherForecastDto] }),
    __metadata("design:type", Array)
], VedurWeatherResponseDto.prototype, "forecast", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最后更新时间' }),
    __metadata("design:type", String)
], VedurWeatherResponseDto.prototype, "lastUpdated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '数据源' }),
    __metadata("design:type", String)
], VedurWeatherResponseDto.prototype, "source", void 0);
//# sourceMappingURL=vedur-weather.dto.js.map