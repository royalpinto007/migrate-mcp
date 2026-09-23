import type { FrameworkCommand } from "../shared/commands.js";

export const golangMigrateCommands = {
  version: (): FrameworkCommand => ({ executable: "migrate", args: ["-version"] }),
  status: (directory: string, databaseUrl: string): FrameworkCommand => ({
    executable: "migrate",
    args: ["-path", directory, "-database", databaseUrl, "version"],
  }),
  generate: (directory: string, name: string): FrameworkCommand => ({
    executable: "migrate",
    args: ["create", "-ext", "sql", "-dir", directory, "-seq", name],
  }),
} as const;
