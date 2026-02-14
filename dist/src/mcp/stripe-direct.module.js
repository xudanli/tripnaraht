"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeDirectModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("../prisma/prisma.module");
const stripe_direct_controller_1 = require("./stripe-direct.controller");
const stripe_direct_service_1 = require("./stripe-direct.service");
let StripeDirectModule = class StripeDirectModule {
};
exports.StripeDirectModule = StripeDirectModule;
exports.StripeDirectModule = StripeDirectModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            prisma_module_1.PrismaModule,
        ],
        controllers: [stripe_direct_controller_1.StripeDirectController],
        providers: [stripe_direct_service_1.StripeDirectService],
        exports: [stripe_direct_service_1.StripeDirectService],
    })
], StripeDirectModule);
//# sourceMappingURL=stripe-direct.module.js.map