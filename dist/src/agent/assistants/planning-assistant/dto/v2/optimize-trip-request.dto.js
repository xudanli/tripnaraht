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
exports.OptimizeTripRequestDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const optimize_plan_request_dto_1 = require("./optimize-plan-request.dto");
class OptimizeTripRequestDto {
}
exports.OptimizeTripRequestDto = OptimizeTripRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '会话ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OptimizeTripRequestDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OptimizeTripRequestDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '优化类型',
        enum: ['pace', 'budget', 'route', 'activities']
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['pace', 'budget', 'route', 'activities']),
    __metadata("design:type", String)
], OptimizeTripRequestDto.prototype, "optimizationType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '优化要求' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => optimize_plan_request_dto_1.OptimizationRequirementsDto),
    __metadata("design:type", optimize_plan_request_dto_1.OptimizationRequirementsDto)
], OptimizeTripRequestDto.prototype, "requirements", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '语言', enum: ['en', 'zh'], default: 'zh' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'zh']),
    __metadata("design:type", String)
], OptimizeTripRequestDto.prototype, "language", void 0);
//# sourceMappingURL=optimize-trip-request.dto.js.map