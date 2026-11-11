"use client";

import { useEffect } from "react";

/**
 * Marks the page as scrolled so the sticky navigation shows its shadow,
 * like react.dev's top bar.
 */
export function ScrollState() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const scrolled = window.scrollY > 4;
      if ((root.dataset.scrolled === "true") !== scrolled)
        root.dataset.scrolled = String(scrolled);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return null;
}
