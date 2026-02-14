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
exports.RouterOutputDto = exports.UIHintDto = exports.BudgetDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const router_interface_1 = require("../interfaces/router.interface");
class BudgetDto {
}
exports.BudgetDto = BudgetDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最大执行时间（秒）', example: 60 }),
    __metadata("design:type", Number)
], BudgetDto.prototype, "max_seconds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最大执行步数', example: 8 }),
    __metadata("design:type", Number)
], BudgetDto.prototype, "max_steps", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '最大浏览器操作步数', example: 12 }),
    __metadata("design:type", Number)
], BudgetDto.prototype, "max_browser_steps", void 0);
class UIHintDto {
}
exports.UIHintDto = UIHintDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '模式', enum: ['fast', 'slow'], example: 'fast' }),
    __metadata("design:type", String)
], UIHintDto.prototype, "mode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '状态',
        enum: router_interface_1.UIStatus,
        example: router_interface_1.UIStatus.DONE,
    }),
    __metadata("design:type", String)
], UIHintDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '提示消息', example: '查询完成' }),
    __metadata("design:type", String)
], UIHintDto.prototype, "message", void 0);
class RouterOutputDto {
}
exports.RouterOutputDto = RouterOutputDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '路由类型',
        enum: router_interface_1.RouteType,
        example: router_interface_1.RouteType.SYSTEM1_RAG,
    }),
    __metadata("design:type", String)
], RouterOutputDto.prototype, "route", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '置信度（0-1）', example: 0.85 }),
    __metadata("design:type", Number)
], RouterOutputDto.prototype, "confidence", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '路由原因',
        type: [String],
        enum: router_interface_1.RouterReason,
        example: [router_interface_1.RouterReason.MULTI_CONSTRAINT],
    }),
    __metadata("design:type", Array)
], RouterOutputDto.prototype, "reasons", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '所需能力',
        type: [String],
        example: ['places', 'transport'],
    }),
    __metadata("design:type", Array)
], RouterOutputDto.prototype, "required_capabilities", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否需要用户授权', example: false }),
    __metadata("design:type", Boolean)
], RouterOutputDto.prototype, "consent_required", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '执行预算', type: BudgetDto }),
    __metadata("design:type", BudgetDto)
], RouterOutputDto.prototype, "budget", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'UI 提示信息', type: UIHintDto }),
    __metadata("design:type", UIHintDto)
], RouterOutputDto.prototype, "ui_hint", void 0);
//# sourceMappingURL=router-output.dto.js.map