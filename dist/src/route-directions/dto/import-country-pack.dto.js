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
exports.ImportCountryPackResultDto = exports.ImportCountryPackDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const create_route_direction_dto_1 = require("./create-route-direction.dto");
class ImportCountryPackDto {
}
exports.ImportCountryPackDto = ImportCountryPackDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '国家代码',
        example: 'IS',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportCountryPackDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '国家名称',
        example: 'Iceland',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportCountryPackDto.prototype, "countryName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '国家中文名称',
        example: '冰岛',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportCountryPackDto.prototype, "countryNameCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '路线方向列表',
        type: [create_route_direction_dto_1.CreateRouteDirectionDto],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => create_route_direction_dto_1.CreateRouteDirectionDto),
    __metadata("design:type", Array)
], ImportCountryPackDto.prototype, "routeDirections", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '区域列表',
        type: [String],
        example: ['IS_CAPITAL', 'IS_MAJOR_CITY_1'],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ImportCountryPackDto.prototype, "regions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '默认策略配置',
        example: {
            defaultPace: 'BALANCED',
            defaultRiskTolerance: 'medium',
        },
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ImportCountryPackDto.prototype, "policy", void 0);
class ImportCountryPackResultDto {
}
exports.ImportCountryPackResultDto = ImportCountryPackResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '国家代码',
        example: 'IS',
    }),
    __metadata("design:type", String)
], ImportCountryPackResultDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '成功导入的路线方向数量',
        example: 3,
    }),
    __metadata("design:type", Number)
], ImportCountryPackResultDto.prototype, "successCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '失败的路线方向数量',
        example: 0,
    }),
    __metadata("design:type", Number)
], ImportCountryPackResultDto.prototype, "failedCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '导入的路线方向详情',
        type: 'array',
        items: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                success: { type: 'boolean' },
                id: { type: 'number', nullable: true },
                error: { type: 'string', nullable: true },
            },
        },
    }),
    __metadata("design:type", Array)
], ImportCountryPackResultDto.prototype, "results", void 0);
//# sourceMappingURL=import-country-pack.dto.js.map