// Paleta de categorías para los gráficos. Vive fuera de los componentes "use client"
// porque el servidor la usa para asignar un color fijo por categoría.
export const COLORS = ["#334B67", "#647B91", "#21865B", "#D9A441", "#C65353", "#8FA3B8", "#5E9C85", "#B5A07A"];

export type Slice = { name: string; value: number; color: string };
