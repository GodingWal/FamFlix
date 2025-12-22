import { ReactNode, createContext, useContext, useMemo } from "react";
import { createPortal } from "react-dom";

interface HelmetContextValue {
  readonly head: HTMLElement | null;
}

const HelmetContext = createContext<HelmetContextValue>({ head: null });

export interface HelmetProviderProps {
  readonly children?: ReactNode;
}

export function HelmetProvider({ children }: HelmetProviderProps) {
  const value = useMemo<HelmetContextValue>(() => {
    if (typeof document === "undefined") {
      return { head: null };
    }

    return { head: document.head };
  }, []);

  return <HelmetContext.Provider value={value}>{children}</HelmetContext.Provider>;
}

export interface HelmetProps {
  readonly children?: ReactNode;
}

export function Helmet({ children }: HelmetProps) {
  const { head } = useContext(HelmetContext);

  if (!head || typeof document === "undefined" || !children) {
    return null;
  }

  return createPortal(children, head);
}

export interface HelmetData {
  readonly toString: () => string;
}

export function useHelmetContext() {
  return useContext(HelmetContext);
}
