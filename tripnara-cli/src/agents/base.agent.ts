export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  abstract name: string;
  abstract run(input: TInput): Promise<TOutput>;
}
