import { Stack } from "expo-router";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";

// TODO(phase-4): QueryClient — @tanstack/react-query is not a declared dep of
// @orbo/app and is not resolvable from apps/app (isolated bun install), and
// package.json is out of scope for WS-01, so no QueryClientProvider yet.
// Follow-up: add "@tanstack/react-query": "5.102.2" to apps/app/package.json,
// run bun install, then wrap the stack in
// <QueryClientProvider client={queryClient}> with the web-app defaults from
// app/src/query-client.ts (retry: 1, refetchOnWindowFocus: false).
// TODO(phase-4): session/auth bootstrap (better-auth + SecureStore) plus
// deep-link + push wiring per docs/planning/03-route-tree.md §5.
// Explicitly out of scope for WS-01 — screens stay placeholders.

type AppTheme = {
  scheme: "light" | "dark";
  background: string;
  foreground: string;
  muted: string;
  border: string;
  card: string;
  accent: string;
};

// Minimal light/dark theme. Hex values transcribed from the canonical
// packages/ui/src/tokens.ts (colors.purple/grey) — that package is
// web/Tailwind-oriented and not a dep of @orbo/app, so only the raw values
// are mirrored here (light card white is the one non-token value). Do not
// grow this into a design system; consume the real tokens if @orbo/ui ever
// ships an RN entry point.
const lightTheme: AppTheme = {
  scheme: "light",
  background: "#F4F6F8",
  foreground: "#161C24",
  muted: "#64748B",
  border: "#D3DAE3",
  card: "#FFFFFF",
  accent: "#6D28D9",
};

const darkTheme: AppTheme = {
  scheme: "dark",
  background: "#0E1319",
  foreground: "#F4F6F8",
  muted: "#8A98AB",
  border: "#232B36",
  card: "#161C24",
  accent: "#8B5CF6",
};

const ThemeContext = createContext<AppTheme>(lightTheme);

export function useAppTheme(): AppTheme {
  return useContext(ThemeContext);
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const theme = useMemo<AppTheme>(
    () => (systemScheme === "dark" ? darkTheme : lightTheme),
    [systemScheme],
  );
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerBackTitle: "Back" }} />
    </ThemeProvider>
  );
}
