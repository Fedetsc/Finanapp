// Paleta de los gráficos. SIN "use client": la usan el servidor (asigna un color fijo
// por categoría) y los componentes de gráficos del navegador.
// Son variables CSS (globals.css): el mismo color se ajusta solo en tema claro y oscuro.
export const COLORS = ["rgb(var(--chart-1))", "#6A93B3", "#8FD9B6", "#F4A259", "#9B8AE6", "rgb(var(--chart-6))", "#2E8B62", "#E88A9A"];

export const CHART = { income: "rgb(var(--pos))", expense: "rgb(var(--neg))", grid: "rgb(var(--line))", axis: "rgb(var(--muted))" } as const;

export type Slice = { name: string; value: number; color: string };
