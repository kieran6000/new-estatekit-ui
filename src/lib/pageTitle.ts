import { createContext, useContext, useEffect } from "react";

// The browser tab's name inside the app: "Leads · EstateKit", or what a page
// is about ("Thandi Mokoena · EstateKit"). The app frame names the section;
// a page that knows better says so with usePageTitle. One place sets the tab,
// so a page and the frame never overwrite each other.

export const PageTitleContext = createContext<(title: string | null) => void>(() => {});

/** Name this page's tab (null or empty: the section's name). */
export function usePageTitle(title: string | null | undefined): void {
  const set = useContext(PageTitleContext);
  useEffect(() => {
    set(title?.trim() || null);
    return () => set(null);
  }, [set, title]);
}

export const appTitle = (title: string) => `${title} · EstateKit`;
