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
exports.BatchUpdateItemsResponseDto = exports.BatchUpdateItemsRequestDto = exports.BatchUpdateItemDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class BatchUpdateItemDto {
}
exports.BatchUpdateItemDto = BatchUpdateItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程项 ID' }),
    __metadata("design:type", String)
], BatchUpdateItemDto.prototype, "itemId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '开始时间（ISO 8601）' }),
    __metadata("design:type", String)
], BatchUpdateItemDto.prototype, "startTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '结束时间（ISO 8601）' }),
    __metadata("design:type", String)
], BatchUpdateItemDto.prototype, "endTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '地点 ID' }),
    __metadata("design:type", Number)
], BatchUpdateItemDto.prototype, "placeId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '备注' }),
    __metadata("design:type", String)
], BatchUpdateItemDto.prototype, "note", void 0);
class BatchUpdateItemsRequestDto {
}
exports.BatchUpdateItemsRequestDto = BatchUpdateItemsRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新列表', type: [BatchUpdateItemDto] }),
    __metadata("design:type", Array)
], BatchUpdateItemsRequestDto.prototype, "updates", void 0);
class BatchUpdateItemsResponseDto {
}
exports.BatchUpdateItemsResponseDto = BatchUpdateItemsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否成功' }),
    __metadata("design:type", Boolean)
], BatchUpdateItemsResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新的项数量' }),
    __metadata("design:type", Number)
], BatchUpdateItemsResponseDto.prototype, "updatedCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '失败的项数量' }),
    __metadata("design:type", Number)
], BatchUpdateItemsResponseDto.prototype, "failedCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '错误信息' }),
    __metadata("design:type", Array)
], BatchUpdateItemsResponseDto.prototype, "errors", void 0);
//# sourceMappingURL=trip-items.dto.js.map