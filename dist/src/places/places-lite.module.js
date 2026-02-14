"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlacesLiteModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../prisma/prisma.module");
const hotels_module_1 = require("../hotels/hotels.module");
const svalbard_poi_features_service_1 = require("./services/svalbard-poi-features.service");
const iceland_poi_features_service_1 = require("./services/iceland-poi-features.service");
const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
    process.env.MCP_MODE === 'true';
let PlacesLiteModule = class PlacesLiteModule {
};
exports.PlacesLiteModule = PlacesLiteModule;
exports.PlacesLiteModule = PlacesLiteModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, hotels_module_1.HotelsModule],
        controllers: [],
        providers: [
            svalbard_poi_features_service_1.SvalbardPoiFeaturesService,
            iceland_poi_features_service_1.IcelandPoiFeaturesService,
        ],
        exports: [
            svalbard_poi_features_service_1.SvalbardPoiFeaturesService,
            iceland_poi_features_service_1.IcelandPoiFeaturesService,
        ],
    })
], PlacesLiteModule);
//# sourceMappingURL=places-lite.module.js.map