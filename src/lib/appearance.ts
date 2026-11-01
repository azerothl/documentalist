import type { CSSProperties } from "react";

export type Theme = "light" | "dark" | "contrast";
export type Appearance = {
  theme: Theme | "system";
  fontSize: 16 | 18 | 20;
  width: "comfortable" | "wide";
  readingMode: boolean;
};
export const APPEARANCE_KEY = "documentalist.appearance.v1";
export const DEFAULT_APPEARANCE: Appearance = {
  theme: "system",
  fontSize: 16,
  width: "comfortable",
  readingMode: false,
};

export function parseAppearance(raw: string | null): Appearance {
  try {
    const value = JSON.parse(raw ?? "null") ?? {};
    return {
      theme: ["system", "light", "dark", "contrast"].includes(value.theme)
        ? value.theme
        : "system",
      fontSize: [16, 18, 20].includes(value.fontSize) ? value.fontSize : 16,
      width: value.width === "wide" ? "wide" : "comfortable",
      readingMode: value.readingMode === true,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function luminance(hex: string) {
  const c = rgb(hex).map((n) => {
    const v = n / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
export function contrastRatio(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mix(a: string, b: string, amount: number) {
  return (
    "#" +
    rgb(a)
      .map((v, i) =>
        Math.round(v * (1 - amount) + rgb(b)[i] * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** Keep custom branding legible on text, selections, buttons and focus rings. */
export function accentStyle(brand: string, theme: Theme): CSSProperties {
  const background =
    theme === "dark" ? "#181a1b" : theme === "contrast" ? "#ffffff" : "#f6f3ee";
  const surface =
    theme === "dark" ? "#222526" : theme === "contrast" ? "#ffffff" : "#fffdf9";
  const original = /^#[\da-f]{6}$/i.test(brand) ? brand : "#0f6e56";
  const toward = theme === "dark" ? "#ffffff" : "#000000";
  let accent = original;
  for (let i = 0; i <= 100; i++) {
    accent = mix(original, toward, i / 100);
    if (
      Math.min(
        contrastRatio(accent, background),
        contrastRatio(accent, surface),
        contrastRatio(accent, mix(surface, accent, 0.1)),
      ) >= 4.5
    )
      break;
  }
  const onAccent =
    contrastRatio("#ffffff", accent) >= contrastRatio("#111111", accent)
      ? "#ffffff"
      : "#111111";
  return {
    "--accent": accent,
    "--accent-soft": mix(surface, accent, 0.1),
    "--on-accent": onAccent,
  } as CSSProperties;
}

// Runs before the first paint. User input is read and validated, never interpolated.
export const appearanceBootstrap = `(()=>{let p={};try{p=JSON.parse(localStorage.getItem('${APPEARANCE_KEY}'))||{}}catch{}const d=document.documentElement;const t=['light','dark','contrast'].includes(p.theme)?p.theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.dataset.theme=t;d.dataset.readingSize=[16,18,20].includes(p.fontSize)?String(p.fontSize):'16';d.dataset.readingWidth=p.width==='wide'?'wide':'comfortable';d.dataset.readingMode=p.readingMode===true?'true':'false';d.style.colorScheme=t==='dark'?'dark':'light'})()`;
