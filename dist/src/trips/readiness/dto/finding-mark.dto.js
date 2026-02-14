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
exports.GetLaterResponseDto = exports.GetNotApplicableResponseDto = exports.LaterItemDto = exports.NotApplicableItemDto = exports.AddToLaterResponseDto = exports.AddToLaterDto = exports.MarkNotApplicableResponseDto = exports.MarkNotApplicableDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class MarkNotApplicableDto {
}
exports.MarkNotApplicableDto = MarkNotApplicableDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '用户填写的不适用原因',
        example: '我们已有 4x4 车辆，无需租赁',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], MarkNotApplicableDto.prototype, "reason", void 0);
class MarkNotApplicableResponseDto {
}
exports.MarkNotApplicableResponseDto = MarkNotApplicableResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Finding 项ID', example: 'blocker-f-4x4-vehicle' }),
    __metadata("design:type", String)
], MarkNotApplicableResponseDto.prototype, "findingId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否已标记', example: true }),
    __metadata("design:type", Boolean)
], MarkNotApplicableResponseDto.prototype, "marked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '不适用原因',
        example: '我们已有 4x4 车辆，无需租赁',
    }),
    __metadata("design:type", String)
], MarkNotApplicableResponseDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '标记时间（ISO 8601 格式）',
        example: '2024-01-15T10:35:00Z',
    }),
    __metadata("design:type", String)
], MarkNotApplicableResponseDto.prototype, "markedAt", void 0);
class AddToLaterDto {
}
exports.AddToLaterDto = AddToLaterDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '提醒日期（ISO 8601 格式）',
        example: '2024-01-20T09:00:00Z',
    }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AddToLaterDto.prototype, "reminderDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '备注',
        example: '等确认路线后再处理',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AddToLaterDto.prototype, "note", void 0);
class AddToLaterResponseDto {
}
exports.AddToLaterResponseDto = AddToLaterResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Finding 项ID', example: 'blocker-f-4x4-vehicle' }),
    __metadata("design:type", String)
], AddToLaterResponseDto.prototype, "findingId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否已添加', example: true }),
    __metadata("design:type", Boolean)
], AddToLaterResponseDto.prototype, "added", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '提醒日期（ISO 8601 格式）',
        example: '2024-01-20T09:00:00Z',
    }),
    __metadata("design:type", String)
], AddToLaterResponseDto.prototype, "reminderDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '备注',
        example: '等确认路线后再处理',
    }),
    __metadata("design:type", String)
], AddToLaterResponseDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '添加时间（ISO 8601 格式）',
        example: '2024-01-15T10:40:00Z',
    }),
    __metadata("design:type", String)
], AddToLaterResponseDto.prototype, "addedAt", void 0);
class NotApplicableItemDto {
}
exports.NotApplicableItemDto = NotApplicableItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Finding 项ID', example: 'blocker-f-4x4-vehicle' }),
    __metadata("design:type", String)
], NotApplicableItemDto.prototype, "findingId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '不适用原因',
        example: '我们已有 4x4 车辆，无需租赁',
    }),
    __metadata("design:type", String)
], NotApplicableItemDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '标记时间（ISO 8601 格式）',
        example: '2024-01-15T10:35:00Z',
    }),
    __metadata("design:type", String)
], NotApplicableItemDto.prototype, "markedAt", void 0);
class LaterItemDto {
}
exports.LaterItemDto = LaterItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Finding 项ID', example: 'blocker-f-4x4-vehicle' }),
    __metadata("design:type", String)
], LaterItemDto.prototype, "findingId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '提醒日期（ISO 8601 格式）',
        example: '2024-01-20T09:00:00Z',
    }),
    __metadata("design:type", String)
], LaterItemDto.prototype, "reminderDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '备注',
        example: '等确认路线后再处理',
    }),
    __metadata("design:type", String)
], LaterItemDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '添加时间（ISO 8601 格式）',
        example: '2024-01-15T10:40:00Z',
    }),
    __metadata("design:type", String)
], LaterItemDto.prototype, "addedAt", void 0);
class GetNotApplicableResponseDto {
}
exports.GetNotApplicableResponseDto = GetNotApplicableResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '不适用项列表',
        type: [NotApplicableItemDto],
    }),
    __metadata("design:type", Array)
], GetNotApplicableResponseDto.prototype, "notApplicableItems", void 0);
class GetLaterResponseDto {
}
exports.GetLaterResponseDto = GetLaterResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '稍后处理项列表',
        type: [LaterItemDto],
    }),
    __metadata("design:type", Array)
], GetLaterResponseDto.prototype, "laterItems", void 0);
//# sourceMappingURL=finding-mark.dto.js.map