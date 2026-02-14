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
exports.PlaceResponseDto = exports.PlaceMetadataResponseDto = void 0;
exports.toPlaceResponseDto = toPlaceResponseDto;
const swagger_1 = require("@nestjs/swagger");
class PlaceMetadataResponseDto {
}
exports.PlaceMetadataResponseDto = PlaceMetadataResponseDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '营业时间（按星期或文本格式）',
        example: {
            mon: '09:00 - 18:00',
            tue: '09:00 - 18:00',
            wed: '09:00 - 18:00',
            thu: '09:00 - 18:00',
            fri: '09:00 - 18:00',
            sat: '10:00 - 17:00',
            sun: 'Closed',
            text: '08:30-17:00（周一闭馆）',
        },
        additionalProperties: { type: 'string' },
    }),
    __metadata("design:type", Object)
], PlaceMetadataResponseDto.prototype, "openingHours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '参考价格（CNY）',
        example: 150,
    }),
    __metadata("design:type", Number)
], PlaceMetadataResponseDto.prototype, "price", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '价格等级（1-4，Google 标准）',
        example: 2,
        minimum: 1,
        maximum: 4,
    }),
    __metadata("design:type", Number)
], PlaceMetadataResponseDto.prototype, "priceLevel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '标签数组',
        type: [String],
        example: ['博物馆', '历史', '艺术'],
    }),
    __metadata("design:type", Array)
], PlaceMetadataResponseDto.prototype, "tags", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '联系电话',
        example: '+81-3-1234-5678',
    }),
    __metadata("design:type", String)
], PlaceMetadataResponseDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '官方网站',
        example: 'https://example.com',
    }),
    __metadata("design:type", String)
], PlaceMetadataResponseDto.prototype, "website", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '营业状态',
        enum: ['OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY', 'UNKNOWN'],
        example: 'OPERATIONAL',
    }),
    __metadata("design:type", String)
], PlaceMetadataResponseDto.prototype, "business_status", void 0);
class PlaceResponseDto {
}
exports.PlaceResponseDto = PlaceResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '地点 ID',
        example: 12345,
    }),
    __metadata("design:type", Number)
], PlaceResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '中文名称',
        example: '东京国立博物馆',
    }),
    __metadata("design:type", String)
], PlaceResponseDto.prototype, "nameCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '英文名称',
        example: 'Tokyo National Museum',
        nullable: true,
    }),
    __metadata("design:type", String)
], PlaceResponseDto.prototype, "nameEN", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '地点类别',
        example: 'MUSEUM',
        enum: [
            'RESTAURANT',
            'CAFE',
            'BAR',
            'HOTEL',
            'ATTRACTION',
            'MUSEUM',
            'PARK',
            'SHOPPING',
            'TRANSPORT',
            'OTHER',
        ],
    }),
    __metadata("design:type", String)
], PlaceResponseDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '地址',
        example: '东京都台东区上野公园13-9',
    }),
    __metadata("design:type", String)
], PlaceResponseDto.prototype, "address", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '评分（0-5）',
        example: 4.5,
        nullable: true,
        minimum: 0,
        maximum: 5,
    }),
    __metadata("design:type", Number)
], PlaceResponseDto.prototype, "rating", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '元数据（包含营业时间、价格、标签等）',
        type: PlaceMetadataResponseDto,
    }),
    __metadata("design:type", PlaceMetadataResponseDto)
], PlaceResponseDto.prototype, "metadata", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '地点介绍',
        example: '东京国立博物馆是日本最大的博物馆...',
        nullable: true,
    }),
    __metadata("design:type", String)
], PlaceResponseDto.prototype, "description", void 0);
function toPlaceResponseDto(place) {
    if (!place)
        return null;
    const metadata = place.metadata;
    const normalizedMetadata = {};
    if (metadata) {
        if (metadata.openingHours) {
            if (typeof metadata.openingHours === 'string') {
                normalizedMetadata.openingHours = {
                    text: metadata.openingHours,
                };
            }
            else {
                normalizedMetadata.openingHours = {
                    mon: metadata.openingHours.mon,
                    tue: metadata.openingHours.tue,
                    wed: metadata.openingHours.wed,
                    thu: metadata.openingHours.thu,
                    fri: metadata.openingHours.fri,
                    sat: metadata.openingHours.sat,
                    sun: metadata.openingHours.sun,
                    weekday: metadata.openingHours.weekday,
                    weekend: metadata.openingHours.weekend,
                };
                Object.keys(normalizedMetadata.openingHours).forEach((key) => {
                    if (normalizedMetadata.openingHours[key] === undefined) {
                        delete normalizedMetadata.openingHours[key];
                    }
                });
            }
        }
        if (metadata.price !== undefined) {
            normalizedMetadata.price = metadata.price;
        }
        if (metadata.priceLevel !== undefined) {
            normalizedMetadata.priceLevel = metadata.priceLevel;
        }
        if (metadata.rawTags && metadata.rawTags.length > 0) {
            normalizedMetadata.tags = metadata.rawTags;
        }
        else if (metadata.tags && metadata.tags.length > 0) {
            normalizedMetadata.tags = metadata.tags;
        }
        if (metadata.contact) {
            if (metadata.contact.phone) {
                normalizedMetadata.phone = metadata.contact.phone;
            }
            if (metadata.contact.website) {
                normalizedMetadata.website = metadata.contact.website;
            }
        }
        if (metadata.phone && !normalizedMetadata.phone) {
            normalizedMetadata.phone = metadata.phone;
        }
        if (metadata.website && !normalizedMetadata.website) {
            normalizedMetadata.website = metadata.website;
        }
        if (metadata.business_status) {
            normalizedMetadata.business_status = metadata.business_status;
        }
    }
    return {
        id: place.id,
        nameCN: place.nameCN,
        nameEN: place.nameEN || null,
        category: place.category,
        address: place.address || '',
        rating: place.rating || null,
        metadata: Object.keys(normalizedMetadata).length > 0 ? normalizedMetadata : undefined,
        description: place.description || null,
    };
}
//# sourceMappingURL=place-response.dto.js.map