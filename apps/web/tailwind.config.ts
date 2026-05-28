import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        bg: { DEFAULT: "hsl(224 14% 6%)", elevated: "hsl(224 14% 8%)" },
        fg: { DEFAULT: "hsl(0 0% 96%)", muted: "hsl(0 0% 64%)", subtle: "hsl(0 0% 44%)" },
        border: { DEFAULT: "hsl(224 8% 16%)", strong: "hsl(224 8% 22%)" },
        accent: { DEFAULT: "hsl(150 80% 52%)", fg: "hsl(150 30% 8%)" },
        danger: { DEFAULT: "hsl(0 84% 60%)" },
        warn: { DEFAULT: "hsl(38 92% 60%)" }
      },
      fontFamily: {
        sans: ["ui-sans-serif", "-apple-system", "Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"]
      },
      fontSize: {
        "display": ["3.25rem", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "600" }],
        "h1": ["2.25rem", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "600" }],
        "h2": ["1.5rem", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body": ["0.95rem", { lineHeight: "1.55" }],
        "small": ["0.825rem", { lineHeight: "1.5" }]
      },
      borderRadius: { lg: "14px", md: "10px", sm: "6px" },
      boxShadow: {
        card: "0 1px 0 0 hsl(224 8% 16%) inset, 0 0 0 1px hsl(224 8% 14%)",
        glow: "0 0 0 1px hsl(150 80% 52% / 0.4), 0 8px 32px -8px hsl(150 80% 52% / 0.3)"
      },
      transitionTimingFunction: { soft: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
    }
  },
  plugins: []
};

export default config;
