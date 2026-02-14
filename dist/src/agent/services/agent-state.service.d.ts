import { AgentState } from '../interfaces/agent-state.interface';
export declare class AgentStateService {
    private readonly logger;
    private readonly states;
    createInitialState(userInput: string, userId: string, tripId?: string | null, options?: any): AgentState;
    get(requestId: string): AgentState | undefined;
    update(requestId: string, updates: Partial<AgentState>): AgentState;
    updateNested(requestId: string, path: string[], value: any): AgentState;
    delete(requestId: string): void;
    cleanup(maxAge?: number): void;
}
