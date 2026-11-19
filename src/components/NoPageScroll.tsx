"use client";
import { useEffect } from "react";

/** Inicio en celular: la página no scrollea (los menús desde abajo sí, por dentro). En escritorio no hace nada. */
export default function NoPageScroll() {
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const html = document.documentElement;
    const apply = () => { html.style.overflow = mq.matches ? "hidden" : ""; html.style.overscrollBehavior = mq.matches ? "none" : ""; };
    apply();
    mq.addEventListener("change", apply);
    return () => { mq.removeEventListener("change", apply); html.style.overflow = ""; html.style.overscrollBehavior = ""; };
  }, []);
  return null;
}
