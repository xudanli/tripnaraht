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
exports.UpdateReadinessPackDto = exports.CreateReadinessPackDto = exports.ReadinessPackListResponseDto = exports.ReadinessPackListItemDto = exports.GetReadinessPacksQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class GetReadinessPacksQueryDto {
    constructor() {
        this.page = 1;
        this.limit = 20;
    }
}
exports.GetReadinessPacksQueryDto = GetReadinessPacksQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '页码', example: 1, default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetReadinessPacksQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '每页数量', example: 20, default: 20 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetReadinessPacksQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '国家代码筛选' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetReadinessPacksQueryDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '目的地ID筛选' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetReadinessPacksQueryDto.prototype, "destinationId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否激活' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], GetReadinessPacksQueryDto.prototype, "isActive", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '搜索关键词（packId、displayName）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetReadinessPacksQueryDto.prototype, "search", void 0);
class ReadinessPackListItemDto {
}
exports.ReadinessPackListItemDto = ReadinessPackListItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pack ID' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pack标识符' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "packId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '目的地ID' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "destinationId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '显示名称（默认）' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '显示名称（英文）' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "displayNameEN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '显示名称（中文）' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "displayNameCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '版本号' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "version", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最后审核时间' }),
    __metadata("design:type", Date)
], ReadinessPackListItemDto.prototype, "lastReviewedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '国家代码' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '区域（默认）' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "region", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '区域（英文）' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "regionEN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '区域（中文）' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "regionCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '城市（默认）' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "city", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '城市（英文）' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "cityEN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '城市（中文）' }),
    __metadata("design:type", String)
], ReadinessPackListItemDto.prototype, "cityCN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否激活' }),
    __metadata("design:type", Boolean)
], ReadinessPackListItemDto.prototype, "isActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '创建时间' }),
    __metadata("design:type", Date)
], ReadinessPackListItemDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '更新时间' }),
    __metadata("design:type", Date)
], ReadinessPackListItemDto.prototype, "updatedAt", void 0);
class ReadinessPackListResponseDto {
}
exports.ReadinessPackListResponseDto = ReadinessPackListResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pack列表', type: [ReadinessPackListItemDto] }),
    __metadata("design:type", Array)
], ReadinessPackListResponseDto.prototype, "packs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总数' }),
    __metadata("design:type", Number)
], ReadinessPackListResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '页码' }),
    __metadata("design:type", Number)
], ReadinessPackListResponseDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '每页数量' }),
    __metadata("design:type", Number)
], ReadinessPackListResponseDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '总页数' }),
    __metadata("design:type", Number)
], ReadinessPackListResponseDto.prototype, "totalPages", void 0);
class CreateReadinessPackDto {
}
exports.CreateReadinessPackDto = CreateReadinessPackDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pack数据', type: Object }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateReadinessPackDto.prototype, "pack", void 0);
class UpdateReadinessPackDto {
}
exports.UpdateReadinessPackDto = UpdateReadinessPackDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Pack数据', type: Object }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UpdateReadinessPackDto.prototype, "pack", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '是否激活' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateReadinessPackDto.prototype, "isActive", void 0);
//# sourceMappingURL=admin-pack.dto.js.map