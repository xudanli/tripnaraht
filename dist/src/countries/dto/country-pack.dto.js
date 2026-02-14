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
exports.CreateOrUpdateCountryPackDto = exports.CountryPackDto = exports.TerrainConstraintsDto = exports.EffortLevelMappingDto = exports.RiskThresholdsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class RiskThresholdsDto {
}
exports.RiskThresholdsDto = RiskThresholdsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '高海拔阈值（米）',
        example: 3500,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RiskThresholdsDto.prototype, "highAltitudeM", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '快速上升阈值（米/天）',
        example: 500,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RiskThresholdsDto.prototype, "rapidAscentM", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '陡坡阈值（百分比）',
        example: 15,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RiskThresholdsDto.prototype, "steepSlopePct", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '大爬升日阈值（米/天）',
        example: 1500,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RiskThresholdsDto.prototype, "bigAscentDayM", void 0);
class EffortLevelMappingDto {
}
exports.EffortLevelMappingDto = EffortLevelMappingDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '轻松等级最大值',
        example: 30,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], EffortLevelMappingDto.prototype, "relaxMax", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '中等等级最大值',
        example: 60,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], EffortLevelMappingDto.prototype, "moderateMax", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '挑战等级最大值',
        example: 85,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], EffortLevelMappingDto.prototype, "challengeMax", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '极限等级最小值',
        example: 85,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], EffortLevelMappingDto.prototype, "extremeMin", void 0);
class TerrainConstraintsDto {
}
exports.TerrainConstraintsDto = TerrainConstraintsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '第一天高海拔限制（米）',
        example: 3000,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TerrainConstraintsDto.prototype, "firstDayMaxElevationM", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '最大日爬升限制（米）',
        example: 1000,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TerrainConstraintsDto.prototype, "maxDailyAscentM", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '连续高爬升天数限制',
        example: 2,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TerrainConstraintsDto.prototype, "maxConsecutiveHighAscentDays", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '高海拔日缓冲时间（小时）',
        example: 2,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TerrainConstraintsDto.prototype, "highAltitudeBufferHours", void 0);
class CountryPackDto {
}
exports.CountryPackDto = CountryPackDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '国家代码',
        example: 'CN_XIZANG',
    }),
    __metadata("design:type", String)
], CountryPackDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '国家名称',
        example: '中国西藏',
    }),
    __metadata("design:type", String)
], CountryPackDto.prototype, "countryName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '风险阈值（覆盖默认值）',
        type: RiskThresholdsDto,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => RiskThresholdsDto),
    __metadata("design:type", RiskThresholdsDto)
], CountryPackDto.prototype, "riskThresholds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '体力等级映射（覆盖默认值）',
        type: EffortLevelMappingDto,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => EffortLevelMappingDto),
    __metadata("design:type", EffortLevelMappingDto)
], CountryPackDto.prototype, "effortLevelMapping", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '地形约束（覆盖默认值）',
        type: TerrainConstraintsDto,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TerrainConstraintsDto),
    __metadata("design:type", TerrainConstraintsDto)
], CountryPackDto.prototype, "terrainConstraints", void 0);
class CreateOrUpdateCountryPackDto {
}
exports.CreateOrUpdateCountryPackDto = CreateOrUpdateCountryPackDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '国家名称',
        example: '中国西藏',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOrUpdateCountryPackDto.prototype, "countryName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '风险阈值（覆盖默认值）',
        type: RiskThresholdsDto,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => RiskThresholdsDto),
    __metadata("design:type", RiskThresholdsDto)
], CreateOrUpdateCountryPackDto.prototype, "riskThresholds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '体力等级映射（覆盖默认值）',
        type: EffortLevelMappingDto,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => EffortLevelMappingDto),
    __metadata("design:type", EffortLevelMappingDto)
], CreateOrUpdateCountryPackDto.prototype, "effortLevelMapping", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '地形约束（覆盖默认值）',
        type: TerrainConstraintsDto,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TerrainConstraintsDto),
    __metadata("design:type", TerrainConstraintsDto)
], CreateOrUpdateCountryPackDto.prototype, "terrainConstraints", void 0);
//# sourceMappingURL=country-pack.dto.js.map