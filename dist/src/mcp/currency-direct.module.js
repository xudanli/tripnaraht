"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyDirectModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("../prisma/prisma.module");
const currency_direct_controller_1 = require("./currency-direct.controller");
const currency_direct_service_1 = require("./currency-direct.service");
let CurrencyDirectModule = class CurrencyDirectModule {
};
exports.CurrencyDirectModule = CurrencyDirectModule;
exports.CurrencyDirectModule = CurrencyDirectModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            prisma_module_1.PrismaModule,
        ],
        controllers: [currency_direct_controller_1.CurrencyDirectController],
        providers: [currency_direct_service_1.CurrencyDirectService],
        exports: [currency_direct_service_1.CurrencyDirectService],
    })
], CurrencyDirectModule);
//# sourceMappingURL=currency-direct.module.js.map