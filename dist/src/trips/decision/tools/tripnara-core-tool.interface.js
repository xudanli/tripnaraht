"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripNaraCoreToolError = void 0;
class TripNaraCoreToolError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'TripNaraCoreToolError';
    }
}
exports.TripNaraCoreToolError = TripNaraCoreToolError;
//# sourceMappingURL=tripnara-core-tool.interface.js.map