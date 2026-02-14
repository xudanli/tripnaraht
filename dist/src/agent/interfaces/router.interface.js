"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UIStatus = exports.RouterReason = exports.RouteType = void 0;
var RouteType;
(function (RouteType) {
    RouteType["SYSTEM1_API"] = "SYSTEM1_API";
    RouteType["SYSTEM1_RAG"] = "SYSTEM1_RAG";
    RouteType["SYSTEM2_REASONING"] = "SYSTEM2_REASONING";
    RouteType["SYSTEM2_WEBBROWSE"] = "SYSTEM2_WEBBROWSE";
})(RouteType || (exports.RouteType = RouteType = {}));
var RouterReason;
(function (RouterReason) {
    RouterReason["MULTI_CONSTRAINT"] = "MULTI_CONSTRAINT";
    RouterReason["MISSING_INFO"] = "MISSING_INFO";
    RouterReason["NO_API"] = "NO_API";
    RouterReason["REALTIME_WEB"] = "REALTIME_WEB";
    RouterReason["HIGH_RISK_ACTION"] = "HIGH_RISK_ACTION";
    RouterReason["LLM_DECISION"] = "LLM_DECISION";
    RouterReason["REDIRECT_TO_PLANNING_WORKBENCH"] = "REDIRECT_TO_PLANNING_WORKBENCH";
})(RouterReason || (exports.RouterReason = RouterReason = {}));
var UIStatus;
(function (UIStatus) {
    UIStatus["THINKING"] = "thinking";
    UIStatus["BROWSING"] = "browsing";
    UIStatus["VERIFYING"] = "verifying";
    UIStatus["REPAIRING"] = "repairing";
    UIStatus["AWAITING_CONSENT"] = "awaiting_consent";
    UIStatus["AWAITING_CONFIRMATION"] = "awaiting_confirmation";
    UIStatus["DONE"] = "done";
    UIStatus["FAILED"] = "failed";
    UIStatus["REDIRECT_REQUIRED"] = "redirect_required";
})(UIStatus || (exports.UIStatus = UIStatus = {}));
//# sourceMappingURL=router.interface.js.map