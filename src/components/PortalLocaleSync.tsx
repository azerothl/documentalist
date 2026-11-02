"use client";

import { useEffect } from "react";

export function PortalLocaleSync({
  language,
  skipLinkLabel,
}: {
  language: string;
  skipLinkLabel: string;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const previousLanguage = root.lang;
    const skipLink = document.querySelector<HTMLAnchorElement>(".skip-link");
    const previousSkipLink = skipLink?.textContent;
    root.lang = language;
    if (skipLink) skipLink.textContent = skipLinkLabel;
    return () => {
      root.lang = previousLanguage;
      if (skipLink && previousSkipLink !== undefined)
        skipLink.textContent = previousSkipLink;
    };
  }, [language, skipLinkLabel]);

  return null;
}
