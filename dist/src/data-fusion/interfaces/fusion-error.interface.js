"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FusionError = void 0;
class FusionError extends Error {
    constructor(message, type, sourceId, retryable = false, cause) {
        super(message);
        this.type = type;
        this.sourceId = sourceId;
        this.retryable = retryable;
        this.cause = cause;
        this.name = 'FusionError';
    }
}
exports.FusionError = FusionError;
//# sourceMappingURL=fusion-error.interface.js.map