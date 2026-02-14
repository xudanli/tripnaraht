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
var StudioModeGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudioModeGuard = exports.RequireStudio = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
exports.RequireStudio = core_1.Reflector.createDecorator();
let StudioModeGuard = StudioModeGuard_1 = class StudioModeGuard {
    constructor(reflector) {
        this.reflector = reflector;
        this.logger = new common_1.Logger(StudioModeGuard_1.name);
    }
    canActivate(context) {
        const requireStudio = this.reflector.getAllAndOverride((0, exports.RequireStudio)(), [context.getHandler(), context.getClass()]);
        if (!requireStudio) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user) {
            this.logger.warn('[StudioModeGuard] 用户未认证');
            throw new common_1.ForbiddenException('需要认证才能访问 Studio 模式');
        }
        const userRoles = user.roles || [];
        const hasStudioPermission = userRoles.includes('studio') ||
            userRoles.includes('admin') ||
            userRoles.includes('ops');
        if (!hasStudioPermission) {
            this.logger.warn(`[StudioModeGuard] 用户 ${user.id || user.email} 没有 Studio 权限`);
            throw new common_1.ForbiddenException('需要 Studio 权限才能访问此功能');
        }
        this.logger.log(`[StudioModeGuard] 用户 ${user.id || user.email} 通过 Studio 权限检查`);
        return true;
    }
};
exports.StudioModeGuard = StudioModeGuard;
exports.StudioModeGuard = StudioModeGuard = StudioModeGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], StudioModeGuard);
//# sourceMappingURL=studio-mode.guard.js.map