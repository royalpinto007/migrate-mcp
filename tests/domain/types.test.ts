import { describe, expect, it } from "vitest";
import { unsupported } from "../../src/domain/capabilities.js";

describe("capability evidence", () => {
  it("keeps unsupported behavior distinct from failure", () => {
    expect(unsupported("sequelize has no verified schema drift command")).toEqual({
      status: "unsupported",
      reason: "sequelize has no verified schema drift command",
    });
  });
});
