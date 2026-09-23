import { npxCommand, type FrameworkCommand } from "../shared/commands.js";

export type PrismaCommandFamily = "v7" | "v8";

export function selectPrismaCommandFamily(version: string): PrismaCommandFamily | undefined {
  if (version.includes("-")) return undefined;
  const match = /^(\d+)\./.exec(version);
  if (!match) return undefined;
  if (match[1] === "7") return "v7";
  if (match[1] === "8") return "v8";
  return undefined;
}

export function prismaCommands(family: PrismaCommandFamily) {
  if (family === "v8") {
    return {
      version: (): FrameworkCommand => npxCommand(["prisma", "--version"]),
      status: (): FrameworkCommand => npxCommand(["prisma", "migration", "status", "--json"]),
      drift: (): FrameworkCommand => npxCommand(["prisma", "db", "verify"]),
      generate: (name: string): FrameworkCommand =>
        npxCommand(["prisma", "migration", "plan", "--name", name]),
    };
  }
  return {
    version: (): FrameworkCommand => npxCommand(["prisma", "--version"]),
    status: (): FrameworkCommand => npxCommand(["prisma", "migrate", "status"]),
    drift: (): FrameworkCommand =>
      npxCommand([
        "prisma",
        "migrate",
        "diff",
        "--from-migrations",
        "prisma/migrations",
        "--to-schema-datamodel",
        "prisma/schema.prisma",
        "--exit-code",
      ]),
    generate: (name: string): FrameworkCommand =>
      npxCommand(["prisma", "migrate", "dev", "--create-only", "--name", name]),
  };
}
