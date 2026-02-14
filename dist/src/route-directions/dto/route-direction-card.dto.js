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
exports.RouteDirectionCardDto = exports.RiskProfileDetailDto = exports.TerrainSignatureDto = exports.RiskType = exports.IntensityLevel = exports.FitForType = void 0;
const swagger_1 = require("@nestjs/swagger");
var FitForType;
(function (FitForType) {
    FitForType["PHOTOGRAPHY"] = "photography";
    FitForType["HIKING"] = "hiking";
    FitForType["SEA"] = "sea";
    FitForType["FAMILY"] = "family";
    FitForType["CHALLENGE"] = "challenge";
})(FitForType || (exports.FitForType = FitForType = {}));
var IntensityLevel;
(function (IntensityLevel) {
    IntensityLevel["RELAX"] = "relax";
    IntensityLevel["MODERATE"] = "moderate";
    IntensityLevel["CHALLENGE"] = "challenge";
})(IntensityLevel || (exports.IntensityLevel = IntensityLevel = {}));
var RiskType;
(function (RiskType) {
    RiskType["HIGH_ALTITUDE"] = "high_altitude";
    RiskType["WEATHER_WINDOW"] = "weather_window";
    RiskType["ROAD_CLOSURE"] = "road_closure";
    RiskType["FERRY"] = "ferry";
})(RiskType || (exports.RiskType = RiskType = {}));
class TerrainSignatureDto {
}
exports.TerrainSignatureDto = TerrainSignatureDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '平均海拔（米）' }),
    __metadata("design:type", Number)
], TerrainSignatureDto.prototype, "avgElevationM", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '海拔范围（米）', example: [2000, 4500] }),
    __metadata("design:type", Array)
], TerrainSignatureDto.prototype, "elevationRangeM", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '最大坡度（%）' }),
    __metadata("design:type", Number)
], TerrainSignatureDto.prototype, "maxSlope", void 0);
class RiskProfileDetailDto {
}
exports.RiskProfileDetailDto = RiskProfileDetailDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '高海拔风险等级（0-3）' }),
    __metadata("design:type", Number)
], RiskProfileDetailDto.prototype, "altitude", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '天气风险等级（0-3）' }),
    __metadata("design:type", Number)
], RiskProfileDetailDto.prototype, "weather", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '隔离度风险等级（0-3）' }),
    __metadata("design:type", Number)
], RiskProfileDetailDto.prototype, "isolation", void 0);
class RouteDirectionCardDto {
}
exports.RouteDirectionCardDto = RouteDirectionCardDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '路线方向 ID' }),
    __metadata("design:type", Number)
], RouteDirectionCardDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '路线方向 UUID' }),
    __metadata("design:type", String)
], RouteDirectionCardDto.prototype, "uuid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '中文标题' }),
    __metadata("design:type", String)
], RouteDirectionCardDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '中文名称' }),
    __metadata("design:type", String)
], RouteDirectionCardDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '英文名称' }),
    __metadata("design:type", String)
], RouteDirectionCardDto.prototype, "nameEN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '标语（UI & 分享用）',
        example: '把每天交给山脊与湖泊'
    }),
    __metadata("design:type", String)
], RouteDirectionCardDto.prototype, "tagline", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '详细描述（200~300字）',
        example: '这条路线将带你深入探索...'
    }),
    __metadata("design:type", String)
], RouteDirectionCardDto.prototype, "longDescription", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '适合人群',
        type: [String],
        example: ['自然党', '摄影党', '轻徒步']
    }),
    __metadata("design:type", Array)
], RouteDirectionCardDto.prototype, "suitableFor", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '不适合人群',
        type: [String],
        example: ['城市控', '赶时间型用户']
    }),
    __metadata("design:type", Array)
], RouteDirectionCardDto.prototype, "notSuitableFor", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最佳月份（1-12）', type: [Number] }),
    __metadata("design:type", Array)
], RouteDirectionCardDto.prototype, "bestMonths", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '禁忌月份（1-12）', type: [Number] }),
    __metadata("design:type", Array)
], RouteDirectionCardDto.prototype, "avoidMonths", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '典型行程天数',
        example: 7
    }),
    __metadata("design:type", Number)
], RouteDirectionCardDto.prototype, "typicalDurationDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '地形特征签名',
        type: TerrainSignatureDto
    }),
    __metadata("design:type", TerrainSignatureDto)
], RouteDirectionCardDto.prototype, "terrainSignature", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '体验标签（情绪 & 体验层）',
        type: [String],
        example: ['震撼', '宁静', '挑战', '文化']
    }),
    __metadata("design:type", Array)
], RouteDirectionCardDto.prototype, "experienceTags", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '风险画像',
        type: RiskProfileDetailDto
    }),
    __metadata("design:type", RiskProfileDetailDto)
], RouteDirectionCardDto.prototype, "riskProfile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '路线描述（兼容字段）' }),
    __metadata("design:type", String)
], RouteDirectionCardDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '推荐理由（2-3句话）' }),
    __metadata("design:type", String)
], RouteDirectionCardDto.prototype, "whyThis", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '国家代码' }),
    __metadata("design:type", String)
], RouteDirectionCardDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '版本号' }),
    __metadata("design:type", String)
], RouteDirectionCardDto.prototype, "version", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '标签', type: [String] }),
    __metadata("design:type", Array)
], RouteDirectionCardDto.prototype, "tags", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '入口枢纽', type: [String] }),
    __metadata("design:type", Array)
], RouteDirectionCardDto.prototype, "entryHubs", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '区域列表', type: [String] }),
    __metadata("design:type", Array)
], RouteDirectionCardDto.prototype, "regions", void 0);
//# sourceMappingURL=route-direction-card.dto.js.map