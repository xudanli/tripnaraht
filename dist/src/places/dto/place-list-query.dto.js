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
exports.PlaceListResponseDto = exports.PlaceListQueryDto = exports.PaginationDirection = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const client_1 = require("@prisma/client");
var PaginationDirection;
(function (PaginationDirection) {
    PaginationDirection["NEXT"] = "next";
    PaginationDirection["PREV"] = "prev";
})(PaginationDirection || (exports.PaginationDirection = PaginationDirection = {}));
class PlaceListQueryDto {
    constructor() {
        this.page = 1;
        this.limit = 20;
        this.orderBy = 'id';
        this.orderDirection = 'desc';
    }
}
exports.PlaceListQueryDto = PlaceListQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '页码（从 1 开始）',
        example: 1,
        minimum: 1,
        default: 1,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PlaceListQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '每页数量',
        example: 20,
        minimum: 1,
        maximum: 100,
        default: 20,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], PlaceListQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '地点类型筛选',
        enum: client_1.PlaceCategory,
        example: 'RESTAURANT',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.PlaceCategory),
    __metadata("design:type", String)
], PlaceListQueryDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '城市ID筛选',
        example: 1,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], PlaceListQueryDto.prototype, "cityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '排序字段',
        enum: ['id', 'rating', 'createdAt', 'updatedAt'],
        example: 'id',
        default: 'id',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['id', 'rating', 'createdAt', 'updatedAt']),
    __metadata("design:type", String)
], PlaceListQueryDto.prototype, "orderBy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '排序方向',
        enum: ['asc', 'desc'],
        example: 'asc',
        default: 'desc',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['asc', 'desc']),
    __metadata("design:type", String)
], PlaceListQueryDto.prototype, "orderDirection", void 0);
class PlaceListResponseDto {
}
exports.PlaceListResponseDto = PlaceListResponseDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '地点列表' }),
    __metadata("design:type", Array)
], PlaceListResponseDto.prototype, "places", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '当前页码' }),
    __metadata("design:type", Number)
], PlaceListResponseDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '每页数量' }),
    __metadata("design:type", Number)
], PlaceListResponseDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '总记录数' }),
    __metadata("design:type", Number)
], PlaceListResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '总页数' }),
    __metadata("design:type", Number)
], PlaceListResponseDto.prototype, "totalPages", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否有上一页' }),
    __metadata("design:type", Boolean)
], PlaceListResponseDto.prototype, "hasPrev", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否有下一页' }),
    __metadata("design:type", Boolean)
], PlaceListResponseDto.prototype, "hasNext", void 0);
//# sourceMappingURL=place-list-query.dto.js.map