import { BaseAgent } from "./base.agent";
import { PolicyAdapter } from "../core/policy";

export class PolicyAgent extends BaseAgent<{ riskScore?: number }, ReturnType<PolicyAdapter["infer"]>> {
  name = "policy";
  private readonly adapter = new PolicyAdapter();

  async run(input: { riskScore?: number }) {
    return this.adapter.infer({ riskScore: input.riskScore ?? 0.4 });
  }
}
