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
exports.GetChecklistStatusResponseDto = exports.ChecklistStatusResponseDto = exports.UpdateChecklistStatusDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class UpdateChecklistStatusDto {
}
exports.UpdateChecklistStatusDto = UpdateChecklistStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '已勾选的 finding item ID 列表',
        example: ['must-item-1', 'must-item-2', 'must-item-5'],
        type: [String],
    }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], UpdateChecklistStatusDto.prototype, "checkedItems", void 0);
class ChecklistStatusResponseDto {
}
exports.ChecklistStatusResponseDto = ChecklistStatusResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新的项数量', example: 3 }),
    __metadata("design:type", Number)
], ChecklistStatusResponseDto.prototype, "updated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '当前已勾选的项列表',
        example: ['must-item-1', 'must-item-2', 'must-item-5'],
        type: [String],
    }),
    __metadata("design:type", Array)
], ChecklistStatusResponseDto.prototype, "checkedItems", void 0);
class GetChecklistStatusResponseDto {
}
exports.GetChecklistStatusResponseDto = GetChecklistStatusResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '已勾选的 finding item ID 列表',
        example: ['must-item-1', 'must-item-2'],
        type: [String],
    }),
    __metadata("design:type", Array)
], GetChecklistStatusResponseDto.prototype, "checkedItems", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '最后更新时间（ISO 8601 格式）',
        example: '2024-01-15T10:30:00Z',
    }),
    __metadata("design:type", String)
], GetChecklistStatusResponseDto.prototype, "lastUpdated", void 0);
//# sourceMappingURL=checklist-status.dto.js.map