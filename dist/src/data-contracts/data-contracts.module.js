"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataContractsModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const data_source_router_service_1 = require("./services/data-source-router.service");
const default_weather_adapter_1 = require("./adapters/default-weather.adapter");
const weatherapi_adapter_1 = require("./adapters/weatherapi.adapter");
const default_road_status_adapter_1 = require("./adapters/default-road-status.adapter");
const iceland_road_status_adapter_1 = require("./adapters/iceland-road-status.adapter");
const iceland_weather_adapter_1 = require("./adapters/iceland-weather.adapter");
const iceland_safety_adapter_1 = require("./adapters/iceland-safety.adapter");
const iceland_aurora_adapter_1 = require("./adapters/iceland-aurora.adapter");
const iceland_froad_service_1 = require("./services/iceland-froad.service");
const iceland_comprehensive_service_1 = require("./services/iceland-comprehensive.service");
const data_contracts_controller_1 = require("./data-contracts.controller");
let DataContractsModule = class DataContractsModule {
    constructor(router, defaultWeather, weatherApi, icelandWeather, defaultRoad, icelandRoad) {
        this.router = router;
        this.defaultWeather = defaultWeather;
        this.weatherApi = weatherApi;
        this.icelandWeather = icelandWeather;
        this.defaultRoad = defaultRoad;
        this.icelandRoad = icelandRoad;
    }
    onModuleInit() {
        console.log('🔌 [DataContractsModule] onModuleInit called - START');
        console.log('🔌 [DataContractsModule] Registering weather adapters...');
        this.router.registerWeatherAdapter(this.icelandWeather);
        this.router.registerWeatherAdapter(this.weatherApi);
        this.router.registerWeatherAdapter(this.defaultWeather);
        console.log('🔌 [DataContractsModule] Weather adapters registered');
        console.log('🔌 [DataContractsModule] Registering road status adapters...');
        this.router.registerRoadStatusAdapter(this.icelandRoad);
        this.router.registerRoadStatusAdapter(this.defaultRoad);
        console.log('🔌 [DataContractsModule] Road status adapters registered');
        console.log('🔌 [DataContractsModule] onModuleInit called - END');
    }
};
exports.DataContractsModule = DataContractsModule;
exports.DataContractsModule = DataContractsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        controllers: [data_contracts_controller_1.DataContractsController],
        providers: [
            data_source_router_service_1.DataSourceRouterService,
            default_weather_adapter_1.DefaultWeatherAdapter,
            weatherapi_adapter_1.WeatherApiAdapter,
            iceland_weather_adapter_1.IcelandWeatherAdapter,
            default_road_status_adapter_1.DefaultRoadStatusAdapter,
            iceland_road_status_adapter_1.IcelandRoadStatusAdapter,
            iceland_safety_adapter_1.IcelandSafetyAdapter,
            iceland_aurora_adapter_1.IcelandAuroraAdapter,
            iceland_froad_service_1.IcelandFRoadService,
            iceland_comprehensive_service_1.IcelandComprehensiveService,
        ],
        exports: [
            data_source_router_service_1.DataSourceRouterService,
            iceland_comprehensive_service_1.IcelandComprehensiveService,
            iceland_safety_adapter_1.IcelandSafetyAdapter,
        ],
    }),
    __metadata("design:paramtypes", [data_source_router_service_1.DataSourceRouterService,
        default_weather_adapter_1.DefaultWeatherAdapter,
        weatherapi_adapter_1.WeatherApiAdapter,
        iceland_weather_adapter_1.IcelandWeatherAdapter,
        default_road_status_adapter_1.DefaultRoadStatusAdapter,
        iceland_road_status_adapter_1.IcelandRoadStatusAdapter])
], DataContractsModule);
//# sourceMappingURL=data-contracts.module.js.map