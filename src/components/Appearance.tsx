"use client";

import { SunMoon } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearance,
  type Appearance,
  type Theme,
} from "@/lib/appearance";
import { Dialog } from "@/components/Dialog";

const initial = JSON.stringify(DEFAULT_APPEARANCE);
let sessionPreferences: string | null = null;
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener("documentalist-appearance", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("documentalist-appearance", notify);
  };
};
function snapshot() {
  if (sessionPreferences !== null) return sessionPreferences;
  try {
    return localStorage.getItem(APPEARANCE_KEY) ?? initial;
  } catch {
    return initial;
  }
}
const subscribeSystem = (notify: () => void) => {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const AppearanceContext = createContext<{
  preferences: Appearance;
  theme: Theme;
  update: (patch: Partial<Appearance>) => void;
}>({ preferences: DEFAULT_APPEARANCE, theme: "light", update: () => {} });

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => initial);
  const dark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  const preferences = useMemo(() => parseAppearance(raw), [raw]);
  const theme =
    preferences.theme === "system"
      ? dark
        ? "dark"
        : "light"
      : preferences.theme;
  // Colors would otherwise fade through 150 ms transitions on every
  // control when the theme changes; switch them instantly instead.
  const previousTheme = useRef<string | null>(null);
  useLayoutEffect(() => {
    const html = document.documentElement;
    const changed =
      previousTheme.current !== null && previousTheme.current !== theme;
    previousTheme.current = theme;
    if (!changed) return;
    html.dataset.themeSwitching = "true";
    const timer = window.setTimeout(() => {
      delete html.dataset.themeSwitching;
    }, 300);
    return () => window.clearTimeout(timer);
  }, [theme]);
  useEffect(() => {
    const current = parseAppearance(snapshot());
    const resolved =
      current.theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : current.theme;
    if (raw !== snapshot() || theme !== resolved) return;
    const html = document.documentElement;
    html.dataset.theme = theme;
    html.dataset.readingSize = String(preferences.fontSize);
    html.dataset.readingWidth = preferences.width;
    html.dataset.readingMode = String(preferences.readingMode);
    html.style.colorScheme = theme === "dark" ? "dark" : "light";
  }, [preferences, theme, raw]);
  function update(patch: Partial<Appearance>) {
    const next = JSON.stringify({ ...parseAppearance(snapshot()), ...patch });
    try {
      localStorage.setItem(APPEARANCE_KEY, next);
      sessionPreferences = null;
    } catch {
      sessionPreferences = next;
    }
    window.dispatchEvent(new Event("documentalist-appearance"));
  }
  return (
    <AppearanceContext.Provider value={{ preferences, theme, update }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export const useAppearance = () => useContext(AppearanceContext);

export function AppearanceSettings({
  variant = "button",
}: {
  /** "icon" renders a round icon button for compact site headers */
  variant?: "button" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const { preferences, update } = useAppearance();
  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          className="site-icon-button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label="Apparence et lecture"
          title="Apparence et lecture"
        >
          <SunMoon size={20} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          className="secondary-button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          Apparence et lecture
        </button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Apparence et lecture"
      >
        <div className="grid gap-5">
          <label>
            Thème
            <select
              aria-label="Thème"
              value={preferences.theme}
              onChange={(e) =>
                update({ theme: e.target.value as Appearance["theme"] })
              }
            >
              <option value="system">Suivre le système</option>
              <option value="light">Clair</option>
              <option value="dark">Sombre — Nuit</option>
              <option value="contrast">Contraste renforcé</option>
            </select>
          </label>
          <label>
            Taille du texte
            <select
              aria-label="Taille du texte"
              value={preferences.fontSize}
              onChange={(e) =>
                update({
                  fontSize: Number(e.target.value) as Appearance["fontSize"],
                })
              }
            >
              <option value={16}>16 px — Standard</option>
              <option value={18}>18 px — Confortable</option>
              <option value={20}>20 px — Agrandi</option>
            </select>
          </label>
          <label>
            Largeur de lecture
            <select
              aria-label="Largeur de lecture"
              value={preferences.width}
              onChange={(e) =>
                update({ width: e.target.value as Appearance["width"] })
              }
            >
              <option value="comfortable">Confortable</option>
              <option value="wide">Large</option>
            </select>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={preferences.readingMode}
              onChange={(e) => update({ readingMode: e.target.checked })}
            />
            <span>
              Mode lecture
              <span className="block text-sm text-[var(--ink-muted)]">
                Masquer les outils de rédaction pour se concentrer sur le
                document.
              </span>
            </span>
          </label>
          <p className="text-sm text-[var(--ink-muted)]">
            Ces préférences sont enregistrées dans ce navigateur et s’appliquent
            à tous vos espaces. Les animations suivent les préférences de votre
            appareil.
          </p>
          <p role="status" className="sr-only">
            Préférences appliquées : {preferences.theme}, texte{" "}
            {preferences.fontSize} pixels.
          </p>
        </div>
      </Dialog>
    </>
  );
}
