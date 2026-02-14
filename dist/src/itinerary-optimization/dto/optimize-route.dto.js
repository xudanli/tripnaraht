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
exports.OptimizeRouteDto = exports.OptimizationConfigDto = exports.PlaceNodeDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class PlaceNodeDto {
}
exports.PlaceNodeDto = PlaceNodeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点 ID', example: 1 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PlaceNodeDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点名称', example: '浅草寺' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlaceNodeDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '强度等级', enum: ['LOW', 'MEDIUM', 'HIGH'] }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], PlaceNodeDto.prototype, "intensity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预估游玩时长（分钟）', example: 90 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], PlaceNodeDto.prototype, "estimatedDuration", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'VRPTW 时间窗约束 [最早到达时间, 最晚到达时间] (ISO 8601 datetime)',
        example: {
            earliest: '2024-05-01T09:00:00+09:00',
            latest: '2024-05-01T22:00:00+09:00',
        },
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], PlaceNodeDto.prototype, "timeWindow", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'VRPTW 服务时长（分钟）- 在地点必须停留的时间',
        example: 120,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], PlaceNodeDto.prototype, "serviceTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否为餐厅', example: false }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], PlaceNodeDto.prototype, "isRestaurant", void 0);
class OptimizationConfigDto {
}
exports.OptimizationConfigDto = OptimizationConfigDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程日期（ISO 8601 date）', example: '2024-05-01' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OptimizationConfigDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '开始时间（ISO 8601 datetime）',
        example: '2024-05-01T09:00:00.000Z',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OptimizationConfigDto.prototype, "startTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '结束时间（ISO 8601 datetime）',
        example: '2024-05-01T18:00:00.000Z',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OptimizationConfigDto.prototype, "endTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '节奏因子（1.0 = 标准, 1.5 = 慢节奏, 0.7 = 快节奏）',
        example: 1.0,
        default: 1.0,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], OptimizationConfigDto.prototype, "pacingFactor", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否带小孩', example: false }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], OptimizationConfigDto.prototype, "hasChildren", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否带老人', example: false }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], OptimizationConfigDto.prototype, "hasElderly", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '午餐时间窗',
        example: { start: '12:00', end: '13:30' },
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], OptimizationConfigDto.prototype, "lunchWindow", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '晚餐时间窗',
        example: { start: '18:00', end: '20:00' },
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], OptimizationConfigDto.prototype, "dinnerWindow", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否启用 VRPTW 算法（带时间窗约束）',
        example: false,
        default: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], OptimizationConfigDto.prototype, "useVRPTW", void 0);
class OptimizeRouteDto {
}
exports.OptimizeRouteDto = OptimizeRouteDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '地点 ID 列表',
        type: [Number],
        example: [1, 2, 3, 4, 5],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsNumber)({}, { each: true }),
    __metadata("design:type", Array)
], OptimizeRouteDto.prototype, "placeIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '优化配置',
        type: OptimizationConfigDto,
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => OptimizationConfigDto),
    __metadata("design:type", OptimizationConfigDto)
], OptimizeRouteDto.prototype, "config", void 0);
//# sourceMappingURL=optimize-route.dto.js.map