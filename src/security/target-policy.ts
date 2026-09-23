import { MigrateMcpError } from "../domain/errors.js";

const PRODUCTION = /(^|[-_.:/])(prod|production|live)([-_.:/]|$)/i;
const SAFE_NAME = /^[a-z][a-z0-9_-]{0,63}$/;

export function assertNonProductionTarget(values: Array<string | undefined>): void {
  if (values.some((value) => value && PRODUCTION.test(value))) {
    throw new MigrateMcpError(
      "UNSAFE_TARGET",
      "Migration generation is blocked for production-like targets.",
    );
  }
}

export function assertMigrationName(name: string): void {
  if (!SAFE_NAME.test(name)) {
    throw new MigrateMcpError(
      "INVALID_INPUT",
      "Migration names must start with a letter and contain only lowercase letters, digits, hyphens, or underscores.",
    );
  }
}
