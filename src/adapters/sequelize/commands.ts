import { npxCommand, type FrameworkCommand } from "../shared/commands.js";

export const sequelizeCommands = {
  version: (): FrameworkCommand => npxCommand(["sequelize-cli", "--version"]),
  status: (): FrameworkCommand => npxCommand(["sequelize-cli", "db:migrate:status"]),
  generate: (name: string): FrameworkCommand =>
    npxCommand(["sequelize-cli", "migration:generate", "--name", name]),
} as const;
