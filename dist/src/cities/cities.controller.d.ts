import { CitiesService } from './cities.service';
import { GetCitiesQueryDto } from './dto/city.dto';
export declare class CitiesController {
    private readonly citiesService;
    private readonly logger;
    constructor(citiesService: CitiesService);
    findAll(query: GetCitiesQueryDto): Promise<any>;
    findOne(id: number): Promise<any>;
}
