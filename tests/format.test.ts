import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatMoneyCompact,
  formatMoneyPrecise,
  toAmount,
} from "@/lib/economy/format";

describe("money parsing", () => {
  it("parses the numeric strings Postgres returns", () => {
    // numeric(20,2) arrives as a string so exact decimals survive transport.
    expect(toAmount("10000.00")).toBe(10000);
    expect(toAmount("82.40")).toBe(82.4);
    expect(toAmount("0.00")).toBe(0);
  });

  it("treats missing or malformed values as zero rather than NaN", () => {
    expect(toAmount(null)).toBe(0);
    expect(toAmount(undefined)).toBe(0);
    expect(toAmount("not-a-number")).toBe(0);
    expect(toAmount("")).toBe(0);
  });

  it("keeps negative amounts negative", () => {
    expect(toAmount("-2500.00")).toBe(-2500);
  });
});

describe("money formatting", () => {
  it("formats headline figures without cents", () => {
    expect(formatMoney("10000.00")).toBe("$10,000");
    expect(formatMoney("1234567.89")).toBe("$1,234,568");
  });

  it("keeps cents where they matter, like share prices", () => {
    expect(formatMoneyPrecise("82.4")).toBe("$82.40");
    expect(formatMoneyPrecise("10")).toBe("$10.00");
  });

  it("compacts large numbers for tight spaces", () => {
    expect(formatMoneyCompact(2_400_000)).toBe("$2.4M");
    expect(formatMoneyCompact(1_500_000_000)).toBe("$1.5B");
    expect(formatMoneyCompact(45_000)).toBe("$45K");
    expect(formatMoneyCompact(950)).toBe("$950");
  });

  it("shows losses with a sign", () => {
    expect(formatMoneyCompact(-2_400_000)).toBe("-$2.4M");
  });
});
