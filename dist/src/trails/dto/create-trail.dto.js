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
exports.CreateTrailDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class CreateTrailDto {
}
exports.CreateTrailDto = CreateTrailDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '路线中文名称',
        example: '武功山：龙山村至东江村'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTrailDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '路线英文名称',
        example: 'Wugongshan: Longshan Village to Dongjiang Village'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTrailDto.prototype, "nameEN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '路线描述'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTrailDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '总距离（公里）',
        example: 14.06
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateTrailDto.prototype, "distanceKm", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '累计爬升（米）',
        example: 1718
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateTrailDto.prototype, "elevationGainM", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '累计下降（米）',
        example: 1761
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateTrailDto.prototype, "elevationLossM", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '最高海拔（米）',
        example: 1692
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTrailDto.prototype, "maxElevationM", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '最低海拔（米）',
        example: 509
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTrailDto.prototype, "minElevationM", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '平均坡度（%）',
        example: 12.22
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTrailDto.prototype, "averageSlope", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '难度等级（EXTREME, HARD, MODERATE, EASY）',
        example: 'EXTREME'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTrailDto.prototype, "difficultyLevel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '等效距离（公里）',
        example: 34.69
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTrailDto.prototype, "equivalentDistanceKm", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '疲劳评分',
        example: 34.69
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTrailDto.prototype, "fatigueScore", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'GPX轨迹数据（坐标点数组）',
        type: 'array',
        items: {
            type: 'object',
            properties: {
                lat: { type: 'number' },
                lng: { type: 'number' },
                elevation: { type: 'number', nullable: true },
                time: { type: 'string', format: 'date-time', nullable: true }
            }
        }
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateTrailDto.prototype, "gpxData", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'GPX文件URL',
        example: 'https://example.com/trail.gpx'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTrailDto.prototype, "gpxFileUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '边界框',
        example: { minlat: 27.48899, minlon: 114.16694, maxlat: 27.54145, maxlon: 114.19963 }
    }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTrailDto.prototype, "bounds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '起点Place ID',
        example: 123
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTrailDto.prototype, "startPlaceId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '终点Place ID',
        example: 456
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTrailDto.prototype, "endPlaceId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '途经点Place ID数组（按顺序）',
        type: [Number],
        example: [789, 101]
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsInt)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateTrailDto.prototype, "waypointPlaceIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '扩展元数据',
        example: { source: 'gpx', rating: 4.5 }
    }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTrailDto.prototype, "metadata", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '数据来源（alltrails, gpx, manual等）',
        example: 'gpx'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTrailDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '来源链接',
        example: 'https://www.alltrails.com/trail/...'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTrailDto.prototype, "sourceUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '评分（0-5）',
        example: 4.5
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], CreateTrailDto.prototype, "rating", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '预计耗时（小时）',
        example: 8.5
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateTrailDto.prototype, "estimatedDurationHours", void 0);
//# sourceMappingURL=create-trail.dto.js.map