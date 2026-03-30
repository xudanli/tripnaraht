export type CliErrorCode =
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "BACKEND_ERROR"
  | "INVALID_RESPONSE"
  | "UNKNOWN_ERROR";

export class CliError extends Error {
  readonly code: CliErrorCode;
  readonly status?: number;

  constructor(code: CliErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof Error) return new CliError("UNKNOWN_ERROR", error.message);
  return new CliError("UNKNOWN_ERROR", String(error));
}
