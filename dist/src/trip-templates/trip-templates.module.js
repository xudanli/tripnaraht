"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripTemplatesModule = void 0;
const common_1 = require("@nestjs/common");
const trip_templates_service_1 = require("./trip-templates.service");
const trip_templates_controller_1 = require("./trip-templates.controller");
const prisma_module_1 = require("../prisma/prisma.module");
const trips_module_1 = require("../trips/trips.module");
let TripTemplatesModule = class TripTemplatesModule {
};
exports.TripTemplatesModule = TripTemplatesModule;
exports.TripTemplatesModule = TripTemplatesModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, trips_module_1.TripsModule],
        controllers: [trip_templates_controller_1.TripTemplatesController, trip_templates_controller_1.TripsFromTemplateController],
        providers: [trip_templates_service_1.TripTemplatesService],
        exports: [trip_templates_service_1.TripTemplatesService],
    })
], TripTemplatesModule);
//# sourceMappingURL=trip-templates.module.js.map