import { describe, expect, it } from "bun:test";
import { repoStatusEnum } from "@/types/Repository";

describe("repoStatusEnum", () => {
  it("includes archived status", () => {
    const res = repoStatusEnum.safeParse("archived");
    expect(res.success).toBe(true);
  });
});

