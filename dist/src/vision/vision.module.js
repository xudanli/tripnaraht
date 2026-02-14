"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisionModule = void 0;
const common_1 = require("@nestjs/common");
const vision_controller_1 = require("./vision.controller");
const vision_service_1 = require("./vision.service");
const mock_ocr_provider_1 = require("../providers/ocr/mock-ocr.provider");
const mock_poi_provider_1 = require("../providers/poi/mock-poi.provider");
let VisionModule = class VisionModule {
};
exports.VisionModule = VisionModule;
exports.VisionModule = VisionModule = __decorate([
    (0, common_1.Module)({
        controllers: [vision_controller_1.VisionController],
        providers: [
            vision_service_1.VisionService,
            mock_ocr_provider_1.MockOcrProvider,
            mock_poi_provider_1.MockPoiProvider,
        ],
        exports: [vision_service_1.VisionService],
    })
], VisionModule);
//# sourceMappingURL=vision.module.js.map