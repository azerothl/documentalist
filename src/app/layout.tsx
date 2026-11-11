import type { Metadata } from "next";
import { Barlow, DM_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AppearanceProvider } from "@/components/Appearance";
import { ScrollState } from "@/components/ScrollState";
import { appearanceBootstrap } from "@/lib/appearance";

// Charte FASST : Barlow pour les titres, DM Sans pour le texte.
const display = Barlow({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Documentalist — documentation",
  description:
    "Organisez, rédigez et consultez votre documentation dans des espaces et des portails accessibles.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}
      >
        <AppearanceProvider>
          <ScrollState />
          <a className="skip-link" href="#main-content">
            Aller au contenu
          </a>
          {children}
        </AppearanceProvider>
      </body>
    </html>
  );
}
