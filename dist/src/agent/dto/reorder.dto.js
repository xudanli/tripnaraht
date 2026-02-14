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
exports.ReorderRequestDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ReorderRequestDto {
}
exports.ReorderRequestDto = ReorderRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '行程ID', example: 'trip-uuid' }),
    __metadata("design:type", String)
], ReorderRequestDto.prototype, "tripId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '日期ID（通常是currentDayId）', example: 'day-uuid' }),
    __metadata("design:type", String)
], ReorderRequestDto.prototype, "dayId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '重新排序后的行程项ID数组',
        type: [String],
        example: ['item1-uuid', 'item2-uuid', 'item3-uuid'],
    }),
    __metadata("design:type", Array)
], ReorderRequestDto.prototype, "newOrder", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '重新排序原因', example: '用户请求调整顺序' }),
    __metadata("design:type", String)
], ReorderRequestDto.prototype, "reason", void 0);
//# sourceMappingURL=reorder.dto.js.map