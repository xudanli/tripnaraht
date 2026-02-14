"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockTtsProvider = void 0;
const common_1 = require("@nestjs/common");
let MockTtsProvider = class MockTtsProvider {
    async speak(text, options) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const mockAudioBuffer = Buffer.from('mock-audio-data');
        return {
            audioBuffer: mockAudioBuffer,
            format: (options === null || options === void 0 ? void 0 : options.format) || 'mp3',
            duration: text.length * 0.1,
        };
    }
};
exports.MockTtsProvider = MockTtsProvider;
exports.MockTtsProvider = MockTtsProvider = __decorate([
    (0, common_1.Injectable)()
], MockTtsProvider);
//# sourceMappingURL=mock-tts.provider.js.map