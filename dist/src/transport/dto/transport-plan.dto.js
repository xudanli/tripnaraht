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
exports.TransportPlanDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class TransportPlanDto {
}
exports.TransportPlanDto = TransportPlanDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '起点纬度',
        example: 35.6762,
        type: Number,
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TransportPlanDto.prototype, "fromLat", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '起点经度',
        example: 139.6503,
        type: Number,
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TransportPlanDto.prototype, "fromLng", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '终点纬度',
        example: 34.6937,
        type: Number,
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TransportPlanDto.prototype, "toLat", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '终点经度',
        example: 135.5023,
        type: Number,
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TransportPlanDto.prototype, "toLng", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否带着行李移动（如：换酒店日）',
        example: false,
        default: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], TransportPlanDto.prototype, "hasLuggage", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否有老人同行',
        example: false,
        default: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], TransportPlanDto.prototype, "hasElderly", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否正在下雨',
        example: false,
        default: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], TransportPlanDto.prototype, "isRaining", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '预算敏感度',
        enum: ['LOW', 'MEDIUM', 'HIGH'],
        example: 'MEDIUM',
        default: 'MEDIUM',
    }),
    (0, class_validator_1.IsEnum)(['LOW', 'MEDIUM', 'HIGH']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], TransportPlanDto.prototype, "budgetSensitivity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '时间敏感度',
        enum: ['LOW', 'MEDIUM', 'HIGH'],
        example: 'MEDIUM',
        default: 'MEDIUM',
    }),
    (0, class_validator_1.IsEnum)(['LOW', 'MEDIUM', 'HIGH']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], TransportPlanDto.prototype, "timeSensitivity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否有行动不便成员',
        example: false,
        default: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], TransportPlanDto.prototype, "hasLimitedMobility", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '当前城市代码（用于判断是否换酒店日）',
        example: 'JP',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], TransportPlanDto.prototype, "currentCity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '目标城市代码（用于判断是否换酒店日）',
        example: 'JP',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], TransportPlanDto.prototype, "targetCity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否为换酒店日',
        example: false,
        default: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], TransportPlanDto.prototype, "isMovingDay", void 0);
//# sourceMappingURL=transport-plan.dto.js.map