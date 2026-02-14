"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const llm_service_1 = require("./services/llm.service");
const llm_cost_service_1 = require("./services/llm-cost.service");
const python_ai_service_1 = require("./services/python-ai.service");
const llm_response_transformer_service_1 = require("./services/llm-response-transformer.service");
const llm_controller_1 = require("./llm.controller");
const infra_module_1 = require("../agent/infra/infra.module");
let LlmModule = class LlmModule {
};
exports.LlmModule = LlmModule;
exports.LlmModule = LlmModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule,
            (0, common_1.forwardRef)(() => infra_module_1.AgentInfraModule),
        ],
        controllers: [llm_controller_1.LlmController],
        providers: [llm_service_1.LlmService, llm_cost_service_1.LlmCostService, python_ai_service_1.PythonAIService, llm_response_transformer_service_1.LlmResponseTransformerService],
        exports: [llm_service_1.LlmService, llm_cost_service_1.LlmCostService, python_ai_service_1.PythonAIService, llm_response_transformer_service_1.LlmResponseTransformerService],
    })
], LlmModule);
//# sourceMappingURL=llm.module.js.map