import { describe, expect, it } from "vitest";
import { GAME_ERROR_MESSAGES, toGameFailure } from "@/lib/errors";

describe("game error translation", () => {
  it("turns a known code into a human sentence", () => {
    expect(toGameFailure({ message: "INSUFFICIENT_FUNDS" })).toEqual({
      code: "INSUFFICIENT_FUNDS",
      message: "Not enough money.",
    });
  });

  it("handles codes raised as plain strings", () => {
    expect(toGameFailure("TICKER_TAKEN").message).toBe("That ticker is taken.");
  });

  it("never leaks a raw database error to the player", () => {
    const failure = toGameFailure({
      message: 'duplicate key value violates unique constraint "companies_ticker_key"',
    });
    expect(failure.code).toBe("UNKNOWN");
    expect(failure.message).toBe("Something went wrong. Please try again.");
    expect(failure.message).not.toContain("constraint");
  });

  it("does not leak Postgres error codes", () => {
    expect(toGameFailure({ code: "23505", message: "RPC_ERROR_23505" }).message).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("survives nonsense input", () => {
    expect(toGameFailure(null).code).toBe("UNKNOWN");
    expect(toGameFailure(undefined).code).toBe("UNKNOWN");
    expect(toGameFailure(42).code).toBe("UNKNOWN");
  });

  it("has a message for every code it claims to know", () => {
    for (const [code, message] of Object.entries(GAME_ERROR_MESSAGES)) {
      expect(message.length, code).toBeGreaterThan(0);
      // Player-facing copy, not an identifier.
      expect(message, code).not.toMatch(/^[A-Z_]+$/);
    }
  });
});
