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
exports.SuggestedActionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SuggestedActionDto {
}
exports.SuggestedActionDto = SuggestedActionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '操作标识' }),
    __metadata("design:type", String)
], SuggestedActionDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标签（英文）' }),
    __metadata("design:type", String)
], SuggestedActionDto.prototype, "label", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '标签（中文）' }),
    __metadata("design:type", String)
], SuggestedActionDto.prototype, "labelCN", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '参数' }),
    __metadata("design:type", Object)
], SuggestedActionDto.prototype, "params", void 0);
//# sourceMappingURL=suggested-action.dto.js.map