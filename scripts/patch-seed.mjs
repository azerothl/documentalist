import fs from "fs";

const p = "src/lib/seed.ts";
let s = fs.readFileSync(p, "utf8");

s = s.replace(/tags: (\[[^\]]*\]),\r?\n(\s+)seoTitle:/g, (_m, tags, sp) => {
  return `tags: ${tags},\n${sp}locale: "en",\n${sp}translationOf: null,\n${sp}sourcePath: null,\n${sp}markdownFormat: null,\n${sp}seoTitle:`;
});

s = s.replace(
  /accentColor: "#0F6E56",\r?\n(\s+)publishedAt:/g,
  `accentColor: "#0F6E56",
$1accessPassword: null,
$1customCss: "",
$1versionGroupId: "vg_product",
$1versionLabel: "current",
$1isMainVersion: true,
$1defaultLocale: "en",
$1locales: ["en", "fr"],
$1publishedAt:`,
);

s = s.replace(
  /accentColor: "#185FA5",\r?\n(\s+)publishedAt:/g,
  `accentColor: "#185FA5",
$1accessPassword: null,
$1customCss: "",
$1versionGroupId: "vg_api",
$1versionLabel: "current",
$1isMainVersion: true,
$1defaultLocale: "en",
$1locales: ["en", "fr"],
$1publishedAt:`,
);

if (!s.includes("integrations:")) {
  s = s.replace("templates: [],\n  };", "templates: [],\n    integrations: [],\n  };");
  s = s.replace("templates: [],\r\n  };", "templates: [],\r\n    integrations: [],\r\n  };");
}

fs.writeFileSync(p, s);
console.log({
  versionGroupId: s.includes("versionGroupId"),
  locale: s.includes('locale: "en"'),
  integrations: s.includes("integrations:"),
});
