import { BaseAgent } from "./base.agent";

export class PlannerAgent extends BaseAgent<{ query: string; days?: number }, { plan: Array<{ day: number; activity: string }> }> {
  name = "planner";

  async run(input: { query: string; days?: number }) {
    const days = input.days ?? 2;
    return {
      plan: Array.from({ length: days }).map((_, i) => ({
        day: i + 1,
        activity: i % 2 === 0 ? "Museum" : "Street Food",
      })),
    };
  }
}
