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
exports.GeneratePlanResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const plan_candidate_dto_1 = require("./shared/plan-candidate.dto");
class GeneratePlanResponseDto {
}
exports.GeneratePlanResponseDto = GeneratePlanResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案列表', type: [plan_candidate_dto_1.PlanCandidateDto] }),
    __metadata("design:type", Array)
], GeneratePlanResponseDto.prototype, "plans", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '会话ID' }),
    __metadata("design:type", String)
], GeneratePlanResponseDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '生成时间' }),
    __metadata("design:type", String)
], GeneratePlanResponseDto.prototype, "generatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '追踪ID' }),
    __metadata("design:type", String)
], GeneratePlanResponseDto.prototype, "traceId", void 0);
//# sourceMappingURL=generate-plan-response.dto.js.map