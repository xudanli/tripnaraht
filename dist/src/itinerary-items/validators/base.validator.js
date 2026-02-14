"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseValidator = void 0;
class BaseValidator {
    createResult(valid, message, details = {}, suggestions) {
        return {
            valid,
            severity: this.getSeverity(),
            code: this.getCode(),
            message,
            details,
            suggestions,
        };
    }
    fail(message, details = {}, suggestions) {
        return this.createResult(false, message, details, suggestions);
    }
    pass() {
        return null;
    }
}
exports.BaseValidator = BaseValidator;
//# sourceMappingURL=base.validator.js.map