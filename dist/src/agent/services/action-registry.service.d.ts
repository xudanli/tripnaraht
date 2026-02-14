import { Action } from '../interfaces/action.interface';
export declare class ActionRegistryService {
    private readonly logger;
    private readonly actions;
    register(action: Action): void;
    registerMany(actions: Action[]): void;
    get(name: string): Action | undefined;
    has(name: string): boolean;
    list(): Action[];
    findByCategory(category: string): Action[];
    checkPreconditions(actionName: string, state: any): boolean;
    private evaluatePrecondition;
}
