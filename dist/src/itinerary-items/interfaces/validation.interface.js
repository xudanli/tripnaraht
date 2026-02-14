"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationCode = exports.ValidationSeverity = void 0;
var ValidationSeverity;
(function (ValidationSeverity) {
    ValidationSeverity["ERROR"] = "error";
    ValidationSeverity["WARNING"] = "warning";
    ValidationSeverity["INFO"] = "info";
})(ValidationSeverity || (exports.ValidationSeverity = ValidationSeverity = {}));
var ValidationCode;
(function (ValidationCode) {
    ValidationCode["TIME_OVERLAP"] = "TIME_OVERLAP";
    ValidationCode["INSUFFICIENT_TRAVEL_TIME"] = "INSUFFICIENT_TRAVEL_TIME";
    ValidationCode["SHORT_BUFFER"] = "SHORT_BUFFER";
    ValidationCode["BUSINESS_HOURS_VIOLATION"] = "BUSINESS_HOURS_VIOLATION";
    ValidationCode["CASCADE_IMPACT"] = "CASCADE_IMPACT";
    ValidationCode["INVALID_TIME_RANGE"] = "INVALID_TIME_RANGE";
    ValidationCode["NOT_FOUND"] = "NOT_FOUND";
})(ValidationCode || (exports.ValidationCode = ValidationCode = {}));
//# sourceMappingURL=validation.interface.js.map