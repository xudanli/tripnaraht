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
exports.HotelDto = exports.HotelOpeningHoursDto = exports.HotelReviewDto = exports.HotelPhotoDto = exports.HotelLocationDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class HotelLocationDto {
}
exports.HotelLocationDto = HotelLocationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '纬度' }),
    __metadata("design:type", Number)
], HotelLocationDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '经度' }),
    __metadata("design:type", Number)
], HotelLocationDto.prototype, "lng", void 0);
class HotelPhotoDto {
}
exports.HotelPhotoDto = HotelPhotoDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '照片引用ID' }),
    __metadata("design:type", String)
], HotelPhotoDto.prototype, "photoReference", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '宽度' }),
    __metadata("design:type", Number)
], HotelPhotoDto.prototype, "width", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '高度' }),
    __metadata("design:type", Number)
], HotelPhotoDto.prototype, "height", void 0);
class HotelReviewDto {
}
exports.HotelReviewDto = HotelReviewDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '评价作者' }),
    __metadata("design:type", String)
], HotelReviewDto.prototype, "authorName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '评分（0-5）' }),
    __metadata("design:type", Number)
], HotelReviewDto.prototype, "rating", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '评价内容' }),
    __metadata("design:type", String)
], HotelReviewDto.prototype, "text", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '评价时间（Unix时间戳）' }),
    __metadata("design:type", Number)
], HotelReviewDto.prototype, "time", void 0);
class HotelOpeningHoursDto {
}
exports.HotelOpeningHoursDto = HotelOpeningHoursDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否正在营业' }),
    __metadata("design:type", Boolean)
], HotelOpeningHoursDto.prototype, "openNow", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '营业时间文本', type: [String] }),
    __metadata("design:type", Array)
], HotelOpeningHoursDto.prototype, "weekdayText", void 0);
class HotelDto {
}
exports.HotelDto = HotelDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Google Places place_id' }),
    __metadata("design:type", String)
], HotelDto.prototype, "placeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '酒店名称' }),
    __metadata("design:type", String)
], HotelDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '地址' }),
    __metadata("design:type", String)
], HotelDto.prototype, "address", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '位置信息', type: HotelLocationDto }),
    __metadata("design:type", HotelLocationDto)
], HotelDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '评分（0-5）' }),
    __metadata("design:type", Number)
], HotelDto.prototype, "rating", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '评价总数' }),
    __metadata("design:type", Number)
], HotelDto.prototype, "userRatingsTotal", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '价格等级（1-4，1=便宜，4=昂贵）' }),
    __metadata("design:type", Number)
], HotelDto.prototype, "priceLevel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '类型列表', type: [String] }),
    __metadata("design:type", Array)
], HotelDto.prototype, "types", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '营业时间', type: HotelOpeningHoursDto }),
    __metadata("design:type", HotelOpeningHoursDto)
], HotelDto.prototype, "openingHours", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '照片列表', type: [HotelPhotoDto] }),
    __metadata("design:type", Array)
], HotelDto.prototype, "photos", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '电话号码' }),
    __metadata("design:type", String)
], HotelDto.prototype, "phoneNumber", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '网站URL' }),
    __metadata("design:type", String)
], HotelDto.prototype, "website", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '评价列表', type: [HotelReviewDto] }),
    __metadata("design:type", Array)
], HotelDto.prototype, "reviews", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '设施列表', type: [String] }),
    __metadata("design:type", Array)
], HotelDto.prototype, "amenities", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '房型列表', type: [String] }),
    __metadata("design:type", Array)
], HotelDto.prototype, "roomTypes", void 0);
//# sourceMappingURL=hotel.dto.js.map