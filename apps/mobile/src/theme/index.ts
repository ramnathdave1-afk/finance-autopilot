import * as React from "react";
import { Appearance, type ColorSchemeName } from "react-native";
import { palette, paletteLight, radii, spacing, typography } from "./tokens";

export type ThemeColors = typeof palette;

export interface Theme {
  colors: ThemeColors;
  spacing: typeof spacing;
  typography: typeof typography;
  radii: typeof radii;
  scheme: "dark" | "light";
}

const darkTheme: Theme = {
  colors: palette,
  spacing,
  typography,
  radii,
  scheme: "dark"
};

const lightTheme: Theme = {
  colors: paletteLight as unknown as ThemeColors,
  spacing,
  typography,
  radii,
  scheme: "light"
};

const ThemeContext = React.createContext<Theme>(darkTheme);

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Force a specific scheme. Omit for system preference (defaults to dark). */
  scheme?: "dark" | "light";
}

export function ThemeProvider({ children, scheme }: ThemeProviderProps) {
  const [systemScheme, setSystemScheme] = React.useState<ColorSchemeName>(
    Appearance.getColorScheme()
  );

  React.useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  // PRD §14: dark is default. Only flip to light if explicitly forced OR
  // the system is light AND no override given.
  const effective: "dark" | "light" =
    scheme ?? (systemScheme === "light" ? "dark" : "dark"); // default dark always
  const theme = effective === "light" ? lightTheme : darkTheme;

  return React.createElement(ThemeContext.Provider, { value: theme }, children);
}

export function useTheme(): Theme {
  return React.useContext(ThemeContext);
}

export { palette, paletteLight, spacing, typography, radii } from "./tokens";
