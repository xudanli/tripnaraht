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
exports.UpdateRouteTemplateDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class UpdateRouteTemplateDto {
}
exports.UpdateRouteTemplateDto = UpdateRouteTemplateDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)({ message: 'routeDirectionId must be an integer' }),
    __metadata("design:type", Number)
], UpdateRouteTemplateDto.prototype, "routeDirectionId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)({ message: 'durationDays must be an integer' }),
    __metadata("design:type", Number)
], UpdateRouteTemplateDto.prototype, "durationDays", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateRouteTemplateDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateRouteTemplateDto.prototype, "nameCN", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateRouteTemplateDto.prototype, "nameEN", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)({ message: 'dayPlans must be an array' }),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (Array.isArray(value)) {
            return value.map((item) => {
                if (typeof item === 'object' && item !== null) {
                    return { ...item };
                }
                return item;
            });
        }
        return value;
    }),
    __metadata("design:type", Array)
], UpdateRouteTemplateDto.prototype, "dayPlans", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (value === 'RELAX')
            return 'RELAXED';
        if (value === 'CHALLENGE')
            return 'INTENSE';
        return value;
    }),
    (0, class_validator_1.IsIn)(['RELAXED', 'BALANCED', 'INTENSE'], {
        message: 'defaultPacePreference must be one of: RELAXED, BALANCED, INTENSE',
    }),
    __metadata("design:type", String)
], UpdateRouteTemplateDto.prototype, "defaultPacePreference", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)({ message: 'metadata must be an object' }),
    __metadata("design:type", Object)
], UpdateRouteTemplateDto.prototype, "metadata", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (value === 'true' || value === true)
            return true;
        if (value === 'false' || value === false)
            return false;
        return value;
    }),
    (0, class_validator_1.IsBoolean)({ message: 'isActive must be a boolean value' }),
    __metadata("design:type", Boolean)
], UpdateRouteTemplateDto.prototype, "isActive", void 0);
//# sourceMappingURL=update-route-template.dto.js.map