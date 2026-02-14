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
exports.SavePlaceImageResponseDto = exports.SavePlaceImageRequestDto = exports.BatchPlaceImageResponseDto = exports.BatchStatsDto = exports.PlaceImageResultDto = exports.UnsplashPhotoDto = exports.UnsplashUserDto = exports.UnsplashAttributionDto = exports.UnsplashUrlsDto = exports.BatchPlaceImageRequestDto = exports.PlaceImageRequestDto = exports.CATEGORY_MAP = exports.VALID_CATEGORIES = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
exports.VALID_CATEGORIES = [
    'ATTRACTION',
    'RESTAURANT',
    'SHOPPING',
    'HOTEL',
    'TRANSIT_HUB',
    'landmark',
    'nature',
    'restaurant',
    'hotel',
    'temple',
    'museum',
    'park',
    'beach',
    'mountain',
];
exports.CATEGORY_MAP = {
    'ATTRACTION': 'landmark',
    'RESTAURANT': 'restaurant',
    'SHOPPING': 'landmark',
    'HOTEL': 'hotel',
    'TRANSIT_HUB': 'landmark',
    'landmark': 'landmark',
    'nature': 'nature',
    'restaurant': 'restaurant',
    'hotel': 'hotel',
    'temple': 'temple',
    'museum': 'museum',
    'park': 'park',
    'beach': 'beach',
    'mountain': 'mountain',
};
class PlaceImageRequestDto {
}
exports.PlaceImageRequestDto = PlaceImageRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '地点 ID（用于关联和缓存）',
        example: 'place_123',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlaceImageRequestDto.prototype, "placeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '地点名称（中文或英文）',
        example: '富士山',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlaceImageRequestDto.prototype, "placeName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '地点英文名称（优先用于搜索，提高匹配度）',
        example: 'Mount Fuji',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlaceImageRequestDto.prototype, "placeNameEn", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '国家名称（辅助搜索定位）',
        example: 'Japan',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlaceImageRequestDto.prototype, "country", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '地点类别（影响搜索关键词），支持 Prisma 格式 (ATTRACTION) 或小写格式 (landmark)',
        enum: exports.VALID_CATEGORIES,
        example: 'landmark',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([...exports.VALID_CATEGORIES]),
    __metadata("design:type", String)
], PlaceImageRequestDto.prototype, "category", void 0);
class BatchPlaceImageRequestDto {
}
exports.BatchPlaceImageRequestDto = BatchPlaceImageRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '地点列表（最少1个，最多20个）',
        type: [PlaceImageRequestDto],
        example: [
            { placeName: '富士山', placeNameEn: 'Mount Fuji', country: 'Japan', category: 'mountain' },
            { placeName: '浅草寺', placeNameEn: 'Sensoji Temple', country: 'Japan', category: 'temple' },
            { placeName: '东京塔', placeNameEn: 'Tokyo Tower', country: 'Japan', category: 'landmark' },
        ],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => PlaceImageRequestDto),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(20),
    __metadata("design:type", Array)
], BatchPlaceImageRequestDto.prototype, "places", void 0);
class UnsplashUrlsDto {
}
exports.UnsplashUrlsDto = UnsplashUrlsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '原始图片 URL（最高质量）' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashUrlsDto.prototype, "raw", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '全尺寸图片 URL' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashUrlsDto.prototype, "full", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '常规尺寸（1080px 宽）', example: 'https://images.unsplash.com/photo-xxx?w=1080' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashUrlsDto.prototype, "regular", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '小尺寸（400px 宽）' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashUrlsDto.prototype, "small", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '缩略图（200px 宽）' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashUrlsDto.prototype, "thumb", void 0);
class UnsplashAttributionDto {
}
exports.UnsplashAttributionDto = UnsplashAttributionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '摄影师名称', example: 'John Doe' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashAttributionDto.prototype, "photographerName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '摄影师主页', example: 'https://unsplash.com/@johndoe' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashAttributionDto.prototype, "photographerUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Unsplash 图片页面', example: 'https://unsplash.com/photos/xxx' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashAttributionDto.prototype, "unsplashUrl", void 0);
class UnsplashUserDto {
}
exports.UnsplashUserDto = UnsplashUserDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '摄影师名称' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashUserDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户名' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashUserDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '主页链接' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashUserDto.prototype, "link", void 0);
class UnsplashPhotoDto {
}
exports.UnsplashPhotoDto = UnsplashPhotoDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '图片 ID', example: 'abc123' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashPhotoDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '图片宽度', example: 4000 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UnsplashPhotoDto.prototype, "width", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '图片高度', example: 3000 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UnsplashPhotoDto.prototype, "height", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '主色调（HEX）', example: '#4A90D9' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashPhotoDto.prototype, "color", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'BlurHash（用于占位符）', example: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashPhotoDto.prototype, "blurHash", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '图片描述' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashPhotoDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '替代描述' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnsplashPhotoDto.prototype, "altDescription", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '图片 URL 集合', type: UnsplashUrlsDto }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => UnsplashUrlsDto),
    __metadata("design:type", UnsplashUrlsDto)
], UnsplashPhotoDto.prototype, "urls", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '摄影师信息', type: UnsplashUserDto }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => UnsplashUserDto),
    __metadata("design:type", UnsplashUserDto)
], UnsplashPhotoDto.prototype, "user", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '归属信息（Unsplash API 要求必须展示）',
        type: UnsplashAttributionDto,
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => UnsplashAttributionDto),
    __metadata("design:type", UnsplashAttributionDto)
], UnsplashPhotoDto.prototype, "attribution", void 0);
class PlaceImageResultDto {
}
exports.PlaceImageResultDto = PlaceImageResultDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '地点 ID' }),
    __metadata("design:type", String)
], PlaceImageResultDto.prototype, "placeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点名称' }),
    __metadata("design:type", String)
], PlaceImageResultDto.prototype, "placeName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '图片数据（如果找到）', type: UnsplashPhotoDto }),
    __metadata("design:type", UnsplashPhotoDto)
], PlaceImageResultDto.prototype, "photo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否来自缓存' }),
    __metadata("design:type", Boolean)
], PlaceImageResultDto.prototype, "cached", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '错误信息（如果失败）' }),
    __metadata("design:type", String)
], PlaceImageResultDto.prototype, "error", void 0);
class BatchStatsDto {
}
exports.BatchStatsDto = BatchStatsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '请求总数', example: 10 }),
    __metadata("design:type", Number)
], BatchStatsDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '成功获取数', example: 8 }),
    __metadata("design:type", Number)
], BatchStatsDto.prototype, "found", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '缓存命中数', example: 3 }),
    __metadata("design:type", Number)
], BatchStatsDto.prototype, "cached", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '失败数', example: 2 }),
    __metadata("design:type", Number)
], BatchStatsDto.prototype, "failed", void 0);
class BatchPlaceImageResponseDto {
}
exports.BatchPlaceImageResponseDto = BatchPlaceImageResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否整体成功' }),
    __metadata("design:type", Boolean)
], BatchPlaceImageResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '结果列表', type: [PlaceImageResultDto] }),
    __metadata("design:type", Array)
], BatchPlaceImageResponseDto.prototype, "results", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '统计信息', type: BatchStatsDto }),
    __metadata("design:type", BatchStatsDto)
], BatchPlaceImageResponseDto.prototype, "stats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '处理耗时（毫秒）', example: 1234 }),
    __metadata("design:type", Number)
], BatchPlaceImageResponseDto.prototype, "processingTimeMs", void 0);
class SavePlaceImageRequestDto {
}
exports.SavePlaceImageRequestDto = SavePlaceImageRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '地点 ID（数据库中的 Place.id）',
        example: 123,
        type: Number,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], SavePlaceImageRequestDto.prototype, "placeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Unsplash 图片数据（从批量接口返回的 photo 字段）',
        type: UnsplashPhotoDto,
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => UnsplashPhotoDto),
    __metadata("design:type", UnsplashPhotoDto)
], SavePlaceImageRequestDto.prototype, "photo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '是否设为主图（如果地点没有其他图片，会自动设为主图）',
        default: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SavePlaceImageRequestDto.prototype, "isPrimary", void 0);
class SavePlaceImageResponseDto {
}
exports.SavePlaceImageResponseDto = SavePlaceImageResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否成功' }),
    __metadata("design:type", Boolean)
], SavePlaceImageResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点 ID' }),
    __metadata("design:type", Number)
], SavePlaceImageResponseDto.prototype, "placeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点名称' }),
    __metadata("design:type", String)
], SavePlaceImageResponseDto.prototype, "placeName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '保存的图片信息' }),
    __metadata("design:type", Object)
], SavePlaceImageResponseDto.prototype, "savedImage", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地点总图片数' }),
    __metadata("design:type", Number)
], SavePlaceImageResponseDto.prototype, "totalImages", void 0);
//# sourceMappingURL=place-image.dto.js.map