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

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h / 6, s, l];
}
function fromHsl(h: number, s: number, l: number) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    const v =
      x < 1 / 6
        ? p + (q - p) * 6 * x
        : x < 1 / 2
          ? q
          : x < 2 / 3
            ? p + (q - p) * (2 / 3 - x) * 6
            : p;
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(h + 1 / 3)}${channel(h)}${channel(h - 1 / 3)}`;
}

/** Keep custom branding legible on text, selections, buttons and focus rings. */
export function accentStyle(brand: string, theme: Theme): CSSProperties {
  const background =
    theme === "dark" ? "#0d2432" : theme === "contrast" ? "#ffffff" : "#ffffff";
  const surface =
    theme === "dark" ? "#12283a" : theme === "contrast" ? "#ffffff" : "#f8f9fb";
  const original = /^#[\da-f]{6}$/i.test(brand) ? brand : "#1f425b";
  // In dark mode, lighten toward a pale sky blue so FASST navy stays blue.
  const toward = theme === "dark" ? "#e3eef5" : "#000000";
  // On the navy background, 4.5:1 leaves links greyish: aim for 7:1.
  const target = theme === "dark" ? 7 : 4.5;
  // In dark mode, lighten the brand hue itself so links stay recognisably
  // blue (or ochre…) instead of drifting to grey.
  const [hue, saturation, lightness] = toHsl(original);
  let accent = original;
  for (let i = 0; i <= 100; i++) {
    accent =
      theme === "dark" && i < 100
        ? fromHsl(hue, saturation, lightness + ((1 - lightness) * i) / 100)
        : mix(original, toward, i / 100);
    if (
      Math.min(
        contrastRatio(accent, background),
        contrastRatio(accent, surface),
        contrastRatio(accent, mix(surface, accent, 0.1)),
      ) >= target
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
