"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProvidersModule = void 0;
const common_1 = require("@nestjs/common");
const mock_ocr_provider_1 = require("./ocr/mock-ocr.provider");
const mock_poi_provider_1 = require("./poi/mock-poi.provider");
const google_ocr_provider_1 = require("./ocr/google-ocr.provider");
const google_poi_provider_1 = require("./poi/google-poi.provider");
const mock_asr_provider_1 = require("./asr/mock-asr.provider");
const mock_tts_provider_1 = require("./tts/mock-tts.provider");
let ProvidersModule = class ProvidersModule {
};
exports.ProvidersModule = ProvidersModule;
exports.ProvidersModule = ProvidersModule = __decorate([
    (0, common_1.Module)({
        providers: [
            mock_ocr_provider_1.MockOcrProvider,
            mock_poi_provider_1.MockPoiProvider,
            google_ocr_provider_1.GoogleOcrProvider,
            google_poi_provider_1.GooglePoiProvider,
            mock_asr_provider_1.MockAsrProvider,
            mock_tts_provider_1.MockTtsProvider,
        ],
        exports: [
            mock_ocr_provider_1.MockOcrProvider,
            mock_poi_provider_1.MockPoiProvider,
            google_ocr_provider_1.GoogleOcrProvider,
            google_poi_provider_1.GooglePoiProvider,
            mock_asr_provider_1.MockAsrProvider,
            mock_tts_provider_1.MockTtsProvider,
        ],
    })
], ProvidersModule);
//# sourceMappingURL=providers.module.js.map