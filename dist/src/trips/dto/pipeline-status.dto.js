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
exports.PipelineStatusResponseDto = exports.PipelineStageDto = exports.PipelineStageStatus = void 0;
const swagger_1 = require("@nestjs/swagger");
var PipelineStageStatus;
(function (PipelineStageStatus) {
    PipelineStageStatus["COMPLETED"] = "completed";
    PipelineStageStatus["IN_PROGRESS"] = "in-progress";
    PipelineStageStatus["PENDING"] = "pending";
    PipelineStageStatus["RISK"] = "risk";
})(PipelineStageStatus || (exports.PipelineStageStatus = PipelineStageStatus = {}));
class PipelineStageDto {
}
exports.PipelineStageDto = PipelineStageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '阶段ID', example: '1' }),
    __metadata("design:type", String)
], PipelineStageDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '阶段名称', example: '明确旅行目标' }),
    __metadata("design:type", String)
], PipelineStageDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '状态', enum: PipelineStageStatus, example: PipelineStageStatus.COMPLETED }),
    __metadata("design:type", String)
], PipelineStageDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '完成时间', example: '2024-12-25T10:00:00Z' }),
    __metadata("design:type", String)
], PipelineStageDto.prototype, "completedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '摘要信息', example: '建议驾驶时长：每天 3–5 小时\n疲劳指数：中\n🚨 第 5 天稍紧张' }),
    __metadata("design:type", String)
], PipelineStageDto.prototype, "summary", void 0);
class PipelineStatusResponseDto {
}
exports.PipelineStatusResponseDto = PipelineStatusResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '阶段列表', type: [PipelineStageDto] }),
    __metadata("design:type", Array)
], PipelineStatusResponseDto.prototype, "stages", void 0);
//# sourceMappingURL=pipeline-status.dto.js.map