"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCodeCategory = exports.TripNARAErrorCode = void 0;
exports.createErrorResponse = createErrorResponse;
var TripNARAErrorCode;
(function (TripNARAErrorCode) {
    TripNARAErrorCode["E_DEM_MISSING"] = "E_DEM_MISSING";
    TripNARAErrorCode["E_DEM_QUERY_FAILED"] = "E_DEM_QUERY_FAILED";
    TripNARAErrorCode["E_DEM_INVALID_PROFILE"] = "E_DEM_INVALID_PROFILE";
    TripNARAErrorCode["E_CORRIDOR_OUTSIDE"] = "E_CORRIDOR_OUTSIDE";
    TripNARAErrorCode["E_CORRIDOR_INVALID"] = "E_CORRIDOR_INVALID";
    TripNARAErrorCode["E_SPATIAL_QUERY_FAILED"] = "E_SPATIAL_QUERY_FAILED";
    TripNARAErrorCode["E_PHILOSOPHY_VIOLATION"] = "E_PHILOSOPHY_VIOLATION";
    TripNARAErrorCode["E_CORE_EXPERIENCE_MISSING"] = "E_CORE_EXPERIENCE_MISSING";
    TripNARAErrorCode["E_HARD_VIOLATION"] = "E_HARD_VIOLATION";
    TripNARAErrorCode["E_HARD_DEM_VIOLATION"] = "E_HARD_DEM_VIOLATION";
    TripNARAErrorCode["E_HARD_COMPLIANCE_VIOLATION"] = "E_HARD_COMPLIANCE_VIOLATION";
    TripNARAErrorCode["E_ROUTE_NOT_FOUND"] = "E_ROUTE_NOT_FOUND";
    TripNARAErrorCode["E_ROUTE_INVALID"] = "E_ROUTE_INVALID";
    TripNARAErrorCode["E_ROUTE_SELECTION_FAILED"] = "E_ROUTE_SELECTION_FAILED";
    TripNARAErrorCode["E_CONTEXT_BUILD_FAILED"] = "E_CONTEXT_BUILD_FAILED";
    TripNARAErrorCode["E_TOKEN_BUDGET_EXCEEDED"] = "E_TOKEN_BUDGET_EXCEEDED";
    TripNARAErrorCode["E_BLOCKS_EMPTY"] = "E_BLOCKS_EMPTY";
    TripNARAErrorCode["E_CONTEXT_COMPRESS_FAILED"] = "E_CONTEXT_COMPRESS_FAILED";
    TripNARAErrorCode["E_INVALID_INPUT"] = "E_INVALID_INPUT";
    TripNARAErrorCode["E_EXECUTION_FAILED"] = "E_EXECUTION_FAILED";
    TripNARAErrorCode["E_SERVICE_UNAVAILABLE"] = "E_SERVICE_UNAVAILABLE";
})(TripNARAErrorCode || (exports.TripNARAErrorCode = TripNARAErrorCode = {}));
exports.ErrorCodeCategory = {
    DEM: [
        TripNARAErrorCode.E_DEM_MISSING,
        TripNARAErrorCode.E_DEM_QUERY_FAILED,
        TripNARAErrorCode.E_DEM_INVALID_PROFILE,
    ],
    SPATIAL: [
        TripNARAErrorCode.E_CORRIDOR_OUTSIDE,
        TripNARAErrorCode.E_CORRIDOR_INVALID,
        TripNARAErrorCode.E_SPATIAL_QUERY_FAILED,
    ],
    PHILOSOPHY: [
        TripNARAErrorCode.E_PHILOSOPHY_VIOLATION,
        TripNARAErrorCode.E_CORE_EXPERIENCE_MISSING,
    ],
    HARD_VIOLATION: [
        TripNARAErrorCode.E_HARD_VIOLATION,
        TripNARAErrorCode.E_HARD_DEM_VIOLATION,
        TripNARAErrorCode.E_HARD_COMPLIANCE_VIOLATION,
    ],
    ROUTE: [
        TripNARAErrorCode.E_ROUTE_NOT_FOUND,
        TripNARAErrorCode.E_ROUTE_INVALID,
        TripNARAErrorCode.E_ROUTE_SELECTION_FAILED,
    ],
    CONTEXT: [
        TripNARAErrorCode.E_CONTEXT_BUILD_FAILED,
        TripNARAErrorCode.E_TOKEN_BUDGET_EXCEEDED,
        TripNARAErrorCode.E_BLOCKS_EMPTY,
        TripNARAErrorCode.E_CONTEXT_COMPRESS_FAILED,
    ],
};
function createErrorResponse(code, message, details) {
    let category;
    for (const [cat, codes] of Object.entries(exports.ErrorCodeCategory)) {
        if (codes.includes(code)) {
            category = cat;
            break;
        }
    }
    return {
        error: {
            code,
            message,
            details,
            category,
        },
    };
}
//# sourceMappingURL=tripnara-error-codes.js.map