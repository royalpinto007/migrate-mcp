import { describe, expect, it } from "vitest";
import { alembicCommands } from "../../src/adapters/alembic/commands.js";
import { golangMigrateCommands } from "../../src/adapters/golang-migrate/commands.js";
import { prismaCommands, selectPrismaCommandFamily } from "../../src/adapters/prisma/commands.js";
import { sequelizeCommands } from "../../src/adapters/sequelize/commands.js";
import { typeormCommands } from "../../src/adapters/typeorm/commands.js";

describe("framework command allowlists", () => {
  it("constructs only review and generation Alembic commands", () => {
    expect(alembicCommands.generate("add_email").args).toEqual([
      "revision",
      "--autogenerate",
      "-m",
      "add_email",
    ]);
    expect(Object.keys(alembicCommands)).not.toContain("upgrade");
  });

  it("creates paired golang-migrate skeletons", () => {
    expect(golangMigrateCommands.generate("migrations", "add_email").args).toEqual([
      "create",
      "-ext",
      "sql",
      "-dir",
      "migrations",
      "-seq",
      "add_email",
    ]);
  });

  it("uses repository-local JS framework executables", () => {
    expect(typeormCommands.status("src/data-source.ts").args).toContain("--no-install");
    expect(sequelizeCommands.generate("add_email").args).toContain("migration:generate");
  });

  it("fails closed for unknown or prerelease Prisma versions", () => {
    expect(selectPrismaCommandFamily("7.2.0")).toBe("v7");
    expect(selectPrismaCommandFamily("8.0.0")).toBe("v8");
    for (const version of ["9.0.0", "8.0.0-beta.2", "garbage"]) {
      expect(selectPrismaCommandFamily(version)).toBeUndefined();
    }
    expect(prismaCommands("v8").generate("add_email").args).toContain("plan");
  });
});
