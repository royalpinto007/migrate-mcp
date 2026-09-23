import { npxCommand, type FrameworkCommand } from "../shared/commands.js";

export const typeormCommands = {
  version: (): FrameworkCommand => npxCommand(["typeorm", "--version"]),
  status: (dataSource: string): FrameworkCommand =>
    npxCommand(["typeorm", "migration:show", "-d", dataSource]),
  drift: (dataSource: string): FrameworkCommand =>
    npxCommand(["typeorm", "schema:log", "-d", dataSource]),
  generate: (dataSource: string, target: string): FrameworkCommand =>
    npxCommand(["typeorm", "migration:generate", "-d", dataSource, target]),
} as const;
