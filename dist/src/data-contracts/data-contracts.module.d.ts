import { OnModuleInit } from '@nestjs/common';
import { DataSourceRouterService } from './services/data-source-router.service';
import { DefaultWeatherAdapter } from './adapters/default-weather.adapter';
import { WeatherApiAdapter } from './adapters/weatherapi.adapter';
import { DefaultRoadStatusAdapter } from './adapters/default-road-status.adapter';
import { IcelandRoadStatusAdapter } from './adapters/iceland-road-status.adapter';
import { IcelandWeatherAdapter } from './adapters/iceland-weather.adapter';
export declare class DataContractsModule implements OnModuleInit {
    private readonly router;
    private readonly defaultWeather;
    private readonly weatherApi;
    private readonly icelandWeather;
    private readonly defaultRoad;
    private readonly icelandRoad;
    constructor(router: DataSourceRouterService, defaultWeather: DefaultWeatherAdapter, weatherApi: WeatherApiAdapter, icelandWeather: IcelandWeatherAdapter, defaultRoad: DefaultRoadStatusAdapter, icelandRoad: IcelandRoadStatusAdapter);
    onModuleInit(): void;
}
