import type { Config } from "tailwindcss";
const c = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"), surface: c("surface"), text: c("text"), muted: c("muted"), primary: c("primary"), "primary-2": c("primary-2"),
        secondary: c("secondary"), pos: c("pos"), mint: c("mint"), "mint-soft": c("mint-soft"), neg: c("neg"), warn: c("warn"), line: c("line"),
      },
      fontFamily: { sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"] },
      boxShadow: {
        soft: "0 1px 2px rgba(16,24,40,.04), 0 6px 20px rgba(16,24,40,.05)",
        fab: "0 10px 24px rgba(45,74,99,.35)",
      },
    },
  },
} satisfies Config;
