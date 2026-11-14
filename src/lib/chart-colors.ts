// Paleta de los gráficos (modo claro). SIN "use client": la usan el servidor (asigna un color fijo
// por categoría) y los componentes de gráficos del navegador.
export const COLORS = ["#2D4A63", "#6A93B3", "#8FD9B6", "#F4A259", "#9B8AE6", "#C9CED8", "#2E8B62", "#E88A9A"];

export const CHART = { income: "#2E8B62", expense: "#E5484D", grid: "#ECEEF2", axis: "#8A94A3" } as const;

export type Slice = { name: string; value: number; color: string };
