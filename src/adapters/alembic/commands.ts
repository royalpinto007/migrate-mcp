import type { FrameworkCommand } from "../shared/commands.js";

export const alembicCommands = {
  version: (): FrameworkCommand => ({ executable: "alembic", args: ["--version"] }),
  status: (): FrameworkCommand => ({ executable: "alembic", args: ["current", "--check-heads"] }),
  history: (): FrameworkCommand => ({ executable: "alembic", args: ["history", "--verbose"] }),
  drift: (): FrameworkCommand => ({ executable: "alembic", args: ["check"] }),
  generate: (name: string): FrameworkCommand => ({
    executable: "alembic",
    args: ["revision", "--autogenerate", "-m", name],
  }),
} as const;
