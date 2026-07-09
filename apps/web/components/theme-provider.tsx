"use client";

import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Attribute = "class" | `data-${string}`;

interface ThemeContextValue {
  forcedTheme?: string;
  resolvedTheme?: string;
  setTheme: Dispatch<SetStateAction<string>>;
  systemTheme?: "dark" | "light";
  theme?: string;
  themes: string[];
}

interface ThemeProviderProps {
  attribute?: Attribute | Attribute[];
  defaultTheme?: string;
  enableColorScheme?: boolean;
  enableSystem?: boolean;
  forcedTheme?: string;
  storageKey?: string;
  themes?: string[];
}

const ThemeContext = createContext<ThemeContextValue>({
  setTheme: () => {},
  themes: [],
});

export function ThemeProvider({
  attribute = "data-theme",
  children,
  defaultTheme,
  enableColorScheme = true,
  enableSystem = true,
  forcedTheme,
  storageKey = "theme",
  themes = ["light", "dark"],
}: PropsWithChildren<ThemeProviderProps>) {
  const fallbackTheme = defaultTheme ?? (enableSystem ? "system" : "light");
  const [theme, setThemeState] = useState(fallbackTheme);
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">("light");

  const resolvedTheme = resolveTheme(forcedTheme ?? theme, systemTheme);

  const setTheme = useCallback<Dispatch<SetStateAction<string>>>(
    (value) => {
      setThemeState((currentTheme) => {
        const nextTheme =
          typeof value === "function" ? value(currentTheme) : value;

        try {
          localStorage.setItem(storageKey, nextTheme);
        } catch {
          // Ignore storage failures in restricted browsing modes.
        }

        return nextTheme;
      });
    },
    [storageKey],
  );

  useEffect(() => {
    try {
      setThemeState(localStorage.getItem(storageKey) || fallbackTheme);
    } catch {
      setThemeState(fallbackTheme);
    }
  }, [fallbackTheme, storageKey]);

  useEffect(() => {
    if (!enableSystem) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      setSystemTheme(media.matches ? "dark" : "light");
    };

    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);

    return () => media.removeEventListener("change", updateSystemTheme);
  }, [enableSystem]);

  useEffect(() => {
    const updateStoredTheme = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      setThemeState(event.newValue || fallbackTheme);
    };

    window.addEventListener("storage", updateStoredTheme);

    return () => window.removeEventListener("storage", updateStoredTheme);
  }, [fallbackTheme, storageKey]);

  useEffect(() => {
    applyTheme({
      attribute,
      enableColorScheme,
      resolvedTheme,
      themes,
    });
  }, [attribute, enableColorScheme, resolvedTheme, themes]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      forcedTheme,
      resolvedTheme,
      setTheme,
      systemTheme: enableSystem ? systemTheme : undefined,
      theme,
      themes: enableSystem ? [...themes, "system"] : themes,
    }),
    [
      enableSystem,
      forcedTheme,
      resolvedTheme,
      setTheme,
      systemTheme,
      theme,
      themes,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme({
  attribute,
  enableColorScheme,
  resolvedTheme,
  themes,
}: {
  attribute: Attribute | Attribute[];
  enableColorScheme: boolean;
  resolvedTheme: string;
  themes: string[];
}) {
  const root = document.documentElement;
  const attributes = Array.isArray(attribute) ? attribute : [attribute];

  for (const currentAttribute of attributes) {
    if (currentAttribute === "class") {
      root.classList.remove(...themes, "system");
      root.classList.add(resolvedTheme);
    } else {
      root.setAttribute(currentAttribute, resolvedTheme);
    }
  }

  if (enableColorScheme) {
    root.style.colorScheme = resolvedTheme === "dark" ? "dark" : "light";
  }
}

function resolveTheme(theme: string, systemTheme: "dark" | "light") {
  return theme === "system" ? systemTheme : theme;
}
