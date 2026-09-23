import { spawn } from "node:child_process";
import { MigrateMcpError } from "../domain/errors.js";
import { redactSensitive } from "../security/redact.js";
import type { CommandResult, CommandSpec } from "./types.js";

export class ProcessRunner {
  readonly #maxOutputBytes: number;
  readonly #timeoutMs: number;

  public constructor(options: { maxOutputBytes?: number; timeoutMs?: number } = {}) {
    this.#maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
  }

  public async run(spec: CommandSpec): Promise<CommandResult> {
    const started = performance.now();
    const timeoutMs = spec.timeoutMs ?? this.#timeoutMs;
    return await new Promise((resolve, reject) => {
      const child = spawn(spec.executable, spec.args, {
        cwd: spec.cwd,
        env: buildAllowedEnvironment(spec.env),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout: Buffer = Buffer.alloc(0);
      let stderr: Buffer = Buffer.alloc(0);
      let truncated = false;
      const append = (current: Buffer, chunk: Buffer): Buffer => {
        if (current.length >= this.#maxOutputBytes) {
          truncated = true;
          return current;
        }
        if (current.length + chunk.length > this.#maxOutputBytes) truncated = true;
        return Buffer.concat([current, chunk.subarray(0, this.#maxOutputBytes - current.length)]);
      };
      child.stdout.on("data", (chunk: Buffer) => (stdout = append(stdout, chunk)));
      child.stderr.on("data", (chunk: Buffer) => (stderr = append(stderr, chunk)));
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(
          new MigrateMcpError(
            "PROCESS_TIMEOUT",
            `Framework command timed out after ${String(timeoutMs)} ms.`,
          ),
        );
      }, timeoutMs);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(
          new MigrateMcpError(
            "CLI_UNAVAILABLE",
            `Could not start framework command: ${error.message}`,
          ),
        );
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const result: CommandResult = {
          exitCode: code ?? -1,
          stdout: redactSensitive(stdout.toString("utf8")),
          stderr: redactSensitive(stderr.toString("utf8")),
          durationMs: Math.round(performance.now() - started),
          truncated,
        };
        resolve(result);
      });
    });
  }
}

function buildAllowedEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const inherited = [
    "PATH",
    "HOME",
    "USERPROFILE",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SystemRoot",
    "ComSpec",
  ];
  const environment: NodeJS.ProcessEnv = {};
  for (const key of inherited)
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  for (const [key, value] of Object.entries(extra)) environment[key] = value;
  environment.NO_COLOR = "1";
  environment.CI = "1";
  return environment;
}
