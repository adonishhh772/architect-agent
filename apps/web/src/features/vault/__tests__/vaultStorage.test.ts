import { describe, expect, it } from "vitest";
import { chooseWorkspaceSalt } from "../vaultStorage";

describe("chooseWorkspaceSalt", () => {
  it("reuses the saved salt after a new tab clears session storage", () => {
    const chosen = chooseWorkspaceSalt({
      localSalt: "stable-salt",
      sessionSalt: null,
      createdSalt: "new-salt",
    });
    expect(chosen.salt).toBe("stable-salt");
    expect(chosen.persistLocal).toBe(false);
    expect(chosen.persistSession).toBe(true);
  });

  it("keeps a tab salt and stores it for the next visit", () => {
    const chosen = chooseWorkspaceSalt({
      localSalt: null,
      sessionSalt: "tab-salt",
      createdSalt: "new-salt",
    });
    expect(chosen.salt).toBe("tab-salt");
    expect(chosen.persistLocal).toBe(true);
    expect(chosen.persistSession).toBe(false);
  });

  it("creates a salt only when none is stored", () => {
    const chosen = chooseWorkspaceSalt({
      localSalt: null,
      sessionSalt: null,
      createdSalt: "new-salt",
    });
    expect(chosen.salt).toBe("new-salt");
    expect(chosen.persistLocal).toBe(true);
    expect(chosen.persistSession).toBe(true);
  });
});
