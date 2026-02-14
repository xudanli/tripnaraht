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
exports.SessionStateResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const destination_recommendation_dto_1 = require("./shared/destination-recommendation.dto");
const plan_candidate_dto_1 = require("./shared/plan-candidate.dto");
class SessionStateResponseDto {
}
exports.SessionStateResponseDto = SessionStateResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '会话ID' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '用户ID' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '当前阶段',
        enum: ['INITIAL', 'COLLECTING_PREFERENCES', 'RECOMMENDING', 'COMPARING_PLANS', 'CONFIRMING', 'COMPLETED']
    }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "phase", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户偏好' }),
    __metadata("design:type", Object)
], SessionStateResponseDto.prototype, "preferences", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '目的地推荐', type: [destination_recommendation_dto_1.DestinationRecommendationDto] }),
    __metadata("design:type", Array)
], SessionStateResponseDto.prototype, "recommendations", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '选中的目的地' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "selectedDestination", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '方案候选', type: [plan_candidate_dto_1.PlanCandidateDto] }),
    __metadata("design:type", Array)
], SessionStateResponseDto.prototype, "planCandidates", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '选中的方案ID' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "selectedPlanId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '确认的行程ID' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "confirmedTripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '消息历史数量' }),
    __metadata("design:type", Number)
], SessionStateResponseDto.prototype, "messageCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新时间' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '过期时间' }),
    __metadata("design:type", String)
], SessionStateResponseDto.prototype, "expiresAt", void 0);
//# sourceMappingURL=session-state-response.dto.js.map