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
exports.ComparePlansRequestDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class ComparePlansRequestDto {
}
exports.ComparePlansRequestDto = ComparePlansRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '会话ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ComparePlansRequestDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '方案ID列表（至少2个）',
        type: [String],
        minLength: 2
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.MinLength)(2, { message: '至少需要2个方案进行对比' }),
    __metadata("design:type", Array)
], ComparePlansRequestDto.prototype, "planIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '对比维度',
        type: [String],
        example: ['budget', 'duration', 'pace', 'activities']
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], ComparePlansRequestDto.prototype, "compareFields", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '语言', enum: ['en', 'zh'], default: 'zh' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'zh']),
    __metadata("design:type", String)
], ComparePlansRequestDto.prototype, "language", void 0);
//# sourceMappingURL=compare-plans-request.dto.js.map