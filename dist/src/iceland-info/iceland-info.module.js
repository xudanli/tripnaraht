"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IcelandInfoModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const iceland_info_controller_1 = require("./iceland-info.controller");
const vedur_service_1 = require("./services/vedur.service");
const safetravel_service_1 = require("./services/safetravel.service");
const road_service_1 = require("./services/road.service");
const rag_module_1 = require("../rag/rag.module");
const data_contracts_module_1 = require("../data-contracts/data-contracts.module");
let IcelandInfoModule = class IcelandInfoModule {
};
exports.IcelandInfoModule = IcelandInfoModule;
exports.IcelandInfoModule = IcelandInfoModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule,
            rag_module_1.RagModule,
            data_contracts_module_1.DataContractsModule,
        ],
        controllers: [iceland_info_controller_1.IcelandInfoController],
        providers: [
            vedur_service_1.VedurService,
            safetravel_service_1.SafetravelService,
            road_service_1.RoadService,
        ],
        exports: [
            vedur_service_1.VedurService,
            safetravel_service_1.SafetravelService,
            road_service_1.RoadService,
        ],
    })
], IcelandInfoModule);
//# sourceMappingURL=iceland-info.module.js.map