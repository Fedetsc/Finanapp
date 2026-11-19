"use client";
// Lista que muestra solo las filas que entran enteras en la pantalla (Inicio no scrollea en celular).
// Si no entran `min` filas, la sección queda oculta. En escritorio muestra todas.
import { Children, useLayoutEffect, useRef, useState } from "react";

export default function FitRows({ header, min = 1, children }: { header: React.ReactNode; min?: number; children: React.ReactNode }) {
  const items = Children.toArray(children);
  const section = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const heights = useRef<number[]>([]);
  const [n, setN] = useState(items.length);

  useLayoutEffect(() => {
    const sec = section.current, ul = list.current, root = sec?.parentElement;
    if (!sec || !ul || !root) return;
    const mobile = window.matchMedia("(max-width: 767px)");
    // Alto de cada fila: se mide con todas visibles (la primera vez o cuando cambian las filas).
    const hs = [...ul.children].map((li) => (li as HTMLElement).offsetHeight);
    const typical = Math.max(0, ...hs); // las filas ocultas miden 0: se usa el alto de una visible
    heights.current = hs.map((h) => h || typical);
    const fit = () => {
      if (!mobile.matches) { setN(items.length); return; }
      const rootCs = getComputedStyle(root), secCs = getComputedStyle(sec);
      const limit = root.getBoundingClientRect().bottom - parseFloat(rootCs.paddingBottom);
      const avail = limit - ul.getBoundingClientRect().top - parseFloat(secCs.paddingBottom) - parseFloat(secCs.borderBottomWidth);
      let used = 0, count = 0;
      for (const h of heights.current) { if (used + h > avail + 0.5) break; used += h; count++; }
      setN(count);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    mobile.addEventListener("change", fit);
    return () => { ro.disconnect(); mobile.removeEventListener("change", fit); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const hide = n < min;
  return (
    <section ref={section} aria-hidden={hide || undefined} className={`card shrink-0 !py-2.5 ${hide ? "invisible" : ""}`}>
      {header}
      <ul ref={list} className="divide-y divide-line">
        {items.map((it, i) => <li key={i} className={i < n ? "" : "hidden"}>{it}</li>)}
      </ul>
    </section>
  );
}
