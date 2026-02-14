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
exports.GetSolutionsResponseDto = exports.SolutionDto = exports.SolutionPreviewDto = exports.SolutionChangesDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SolutionChangesDto {
}
exports.SolutionChangesDto = SolutionChangesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '时间变化',
        example: '+30min',
    }),
    __metadata("design:type", String)
], SolutionChangesDto.prototype, "time", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '距离变化',
        example: '+12km',
    }),
    __metadata("design:type", String)
], SolutionChangesDto.prototype, "distance", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '费用变化',
        example: '+¥500',
    }),
    __metadata("design:type", String)
], SolutionChangesDto.prototype, "cost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '风险变化',
        enum: ['increase', 'decrease', 'same'],
        example: 'decrease',
    }),
    __metadata("design:type", String)
], SolutionChangesDto.prototype, "risk", void 0);
class SolutionPreviewDto {
}
exports.SolutionPreviewDto = SolutionPreviewDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '受影响的行程项ID列表',
        example: ['segment-f-1', 'segment-f-2'],
        type: [String],
    }),
    __metadata("design:type", Array)
], SolutionPreviewDto.prototype, "affectedItems", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '新计划预览',
        example: {},
    }),
    __metadata("design:type", Object)
], SolutionPreviewDto.prototype, "newPlan", void 0);
class SolutionDto {
}
exports.SolutionDto = SolutionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案ID', example: 'sol-1' }),
    __metadata("design:type", String)
], SolutionDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '方案标题', example: '替换为铺装路面路线' }),
    __metadata("design:type", String)
], SolutionDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '方案描述',
        example: '将 F 段改为使用铺装路面，绕行距离增加 15km',
    }),
    __metadata("design:type", String)
], SolutionDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '方案类型',
        enum: ['replace', 'adjust', 'alternative', 'manual'],
        example: 'alternative',
    }),
    __metadata("design:type", String)
], SolutionDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '预期变更',
        type: SolutionChangesDto,
    }),
    __metadata("design:type", SolutionChangesDto)
], SolutionDto.prototype, "changes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '原因代码',
        example: 'ALTERNATIVE_ROUTE',
    }),
    __metadata("design:type", String)
], SolutionDto.prototype, "reasonCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '证据链接',
        example: 'https://example.com/evidence',
    }),
    __metadata("design:type", String)
], SolutionDto.prototype, "evidenceLink", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '是否可自动应用',
        example: true,
    }),
    __metadata("design:type", Boolean)
], SolutionDto.prototype, "autoApplicable", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '预览数据（如果可自动应用）',
        type: SolutionPreviewDto,
    }),
    __metadata("design:type", SolutionPreviewDto)
], SolutionDto.prototype, "preview", void 0);
class GetSolutionsResponseDto {
}
exports.GetSolutionsResponseDto = GetSolutionsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '阻塞项ID', example: 'blocker-f-4x4-vehicle' }),
    __metadata("design:type", String)
], GetSolutionsResponseDto.prototype, "blockerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '阻塞项消息',
        example: 'F - 公路段需租赁 4x4 车辆',
    }),
    __metadata("design:type", String)
], GetSolutionsResponseDto.prototype, "blockerMessage", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '解决方案列表',
        type: [SolutionDto],
    }),
    __metadata("design:type", Array)
], GetSolutionsResponseDto.prototype, "solutions", void 0);
//# sourceMappingURL=solution.dto.js.map