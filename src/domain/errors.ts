export type ErrorCode =
  | "INVALID_INPUT"
  | "PATH_OUTSIDE_REPOSITORY"
  | "FRAMEWORK_NOT_DETECTED"
  | "AMBIGUOUS_FRAMEWORK"
  | "CLI_UNAVAILABLE"
  | "UNSUPPORTED_CAPABILITY"
  | "APPROVAL_REQUIRED"
  | "UNSAFE_TARGET"
  | "UNEXPECTED_FILE_WRITE"
  | "PROCESS_TIMEOUT"
  | "PROCESS_FAILED"
  | "PARSE_FAILED"
  | "INTERNAL_ERROR";

export class MigrateMcpError extends Error {
  public constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly diagnostics: string[] = [],
  ) {
    super(message);
    this.name = "MigrateMcpError";
  }
}
