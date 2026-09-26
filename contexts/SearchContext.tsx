import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

// Home's own search box, Marketplace's, and Orgs' all duplicated the
// global DesktopTopBar search that sits above them — same placeholder
// text, same input, stacked right on top of each other. But they
// aren't all the SAME kind of search: Home's navigates to /browse,
// while Marketplace/Orgs filter their own already-loaded list live as
// you type. A single hardcoded "always navigate to /browse" behavior
// in the top bar would have silently broken live filtering on those
// two screens. This context lets whichever screen is currently
// focused register its own placeholder text and search handler; the
// top bar reads whatever's currently registered instead of hardcoding
// one behavior for every page. Screens keep their own local input
// state (so typing still filters live, etc.) and just also forward
// each change into this shared value via registerSearch.
type SearchRegistration = {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
};

type SearchContextValue = {
  registration: SearchRegistration | null;
  registerSearch: (reg: SearchRegistration) => void;
  unregisterSearch: () => void;
};

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<SearchRegistration | null>(null);
  // Guards against an unmounting screen's cleanup clearing a
  // registration that a newly-focused screen already replaced it with
  // (ordering between the old screen's blur and the new screen's focus
  // isn't guaranteed), by only clearing if nothing newer took over.
  const activeIdRef = useRef(0);

  const registerSearch = useCallback((reg: SearchRegistration) => {
    activeIdRef.current += 1;
    const id = activeIdRef.current;
    setRegistration({ ...reg, __id: id } as any);
  }, []);

  const unregisterSearch = useCallback(() => {
    setRegistration(null);
  }, []);

  return (
    <SearchContext.Provider value={{ registration, registerSearch, unregisterSearch }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearchContext() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearchContext must be used within SearchProvider');
  return ctx;
}
