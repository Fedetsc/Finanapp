import type { Config } from "tailwindcss";
const c = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { bg: c("bg"), surface: c("surface"), text: c("text"), muted: c("muted"), primary: c("primary"), secondary: c("secondary"), pos: c("pos"), neg: c("neg"), warn: c("warn"), line: c("line") } } },
} satisfies Config;
