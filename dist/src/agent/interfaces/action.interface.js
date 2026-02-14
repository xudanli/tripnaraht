"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionSideEffect = exports.ActionCost = exports.ActionKind = void 0;
var ActionKind;
(function (ActionKind) {
    ActionKind["INTERNAL"] = "internal";
    ActionKind["EXTERNAL"] = "external";
})(ActionKind || (exports.ActionKind = ActionKind = {}));
var ActionCost;
(function (ActionCost) {
    ActionCost["LOW"] = "low";
    ActionCost["MEDIUM"] = "medium";
    ActionCost["HIGH"] = "high";
})(ActionCost || (exports.ActionCost = ActionCost = {}));
var ActionSideEffect;
(function (ActionSideEffect) {
    ActionSideEffect["NONE"] = "none";
    ActionSideEffect["WRITES_DB"] = "writes_db";
    ActionSideEffect["CALLS_API"] = "calls_api";
    ActionSideEffect["CHARGES_MONEY"] = "charges_money";
})(ActionSideEffect || (exports.ActionSideEffect = ActionSideEffect = {}));
//# sourceMappingURL=action.interface.js.map