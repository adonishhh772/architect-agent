import { describe, expect, it } from "vitest";
import {
  SIDEBAR_COLLAPSED_VALUE,
  readSidebarCollapsed,
  sidebarCollapsedStorageValue,
} from "./shellNavigation";

describe("readSidebarCollapsed", () => {
  it("treats the stored flag as collapsed", () => {
    expect(readSidebarCollapsed(SIDEBAR_COLLAPSED_VALUE)).toBe(true);
  });

  it("treats a missing or other value as expanded", () => {
    expect(readSidebarCollapsed(null)).toBe(false);
    expect(readSidebarCollapsed("")).toBe(false);
    expect(readSidebarCollapsed("true")).toBe(false);
  });
});

describe("sidebarCollapsedStorageValue", () => {
  it("stores a flag when minimized and clears it when expanded", () => {
    expect(sidebarCollapsedStorageValue(true)).toBe(SIDEBAR_COLLAPSED_VALUE);
    expect(sidebarCollapsedStorageValue(false)).toBeNull();
  });
});
