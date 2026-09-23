export interface CommandSpec {
  executable: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
}
