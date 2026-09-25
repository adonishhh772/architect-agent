import { describe, expect, it } from "vitest";
import {
  SIDEBAR_COLLAPSED_VALUE,
  SIDEBAR_EXPANDED_VALUE,
  readSidebarCollapsed,
  sidebarCollapsedStorageValue,
} from "./shellNavigation";

describe("readSidebarCollapsed", () => {
  it("starts collapsed when nothing has been saved", () => {
    expect(readSidebarCollapsed(null)).toBe(true);
    expect(readSidebarCollapsed("")).toBe(true);
    expect(readSidebarCollapsed(SIDEBAR_COLLAPSED_VALUE)).toBe(true);
  });

  it("stays expanded only after that choice is saved", () => {
    expect(readSidebarCollapsed(SIDEBAR_EXPANDED_VALUE)).toBe(false);
  });
});

describe("sidebarCollapsedStorageValue", () => {
  it("stores collapsed and expanded as separate flags", () => {
    expect(sidebarCollapsedStorageValue(true)).toBe(SIDEBAR_COLLAPSED_VALUE);
    expect(sidebarCollapsedStorageValue(false)).toBe(SIDEBAR_EXPANDED_VALUE);
  });
});
