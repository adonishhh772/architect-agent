export const SIDEBAR_COLLAPSED_KEY = "sentinel-sidebar-collapsed";
export const SIDEBAR_COLLAPSED_VALUE = "1";
export const SIDEBAR_EXPANDED_VALUE = "0";

export const OPEN_MENU_LABEL = "Open menu";
export const CLOSE_MENU_LABEL = "Close menu";
export const MINIMIZE_MENU_LABEL = "Minimize menu";
export const EXPAND_MENU_LABEL = "Expand menu";
export const CLOSE_MENU_BACKDROP_LABEL = "Close menu";

export function readSidebarCollapsed(stored: string | null): boolean {
  return stored !== SIDEBAR_EXPANDED_VALUE;
}

export function sidebarCollapsedStorageValue(collapsed: boolean): string {
  if (collapsed) {
    return SIDEBAR_COLLAPSED_VALUE;
  }
  return SIDEBAR_EXPANDED_VALUE;
}
