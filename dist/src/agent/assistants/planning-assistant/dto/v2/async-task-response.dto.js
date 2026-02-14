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
exports.AsyncTaskResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class AsyncTaskResponseDto {
}
exports.AsyncTaskResponseDto = AsyncTaskResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '任务ID' }),
    __metadata("design:type", String)
], AsyncTaskResponseDto.prototype, "taskId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '任务状态',
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']
    }),
    __metadata("design:type", String)
], AsyncTaskResponseDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '进度百分比', minimum: 0, maximum: 100 }),
    __metadata("design:type", Number)
], AsyncTaskResponseDto.prototype, "progress", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '当前阶段' }),
    __metadata("design:type", String)
], AsyncTaskResponseDto.prototype, "currentStage", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预计剩余时间（秒）' }),
    __metadata("design:type", Number)
], AsyncTaskResponseDto.prototype, "estimatedTimeRemaining", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '更新时间' }),
    __metadata("design:type", String)
], AsyncTaskResponseDto.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结果（完成时）' }),
    __metadata("design:type", Object)
], AsyncTaskResponseDto.prototype, "result", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '错误信息（失败时）' }),
    __metadata("design:type", Object)
], AsyncTaskResponseDto.prototype, "error", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", String)
], AsyncTaskResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '完成时间' }),
    __metadata("design:type", String)
], AsyncTaskResponseDto.prototype, "completedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预估耗时（秒）' }),
    __metadata("design:type", Number)
], AsyncTaskResponseDto.prototype, "estimatedDuration", void 0);
//# sourceMappingURL=async-task-response.dto.js.map