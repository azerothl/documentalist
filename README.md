# Documentalist

Local knowledge-portal platform inspired by [Archbee](https://www.archbee.com/): **Spaces → nested documents → slash-block editor → publishable reader site**.

Evidence of how Archbee works (cited product docs + architecture post) is in the Cursor canvas
`archbee-evidence.canvas.tsx` (open beside chat from the canvases folder).

## Run

```bash
npm install
npm run dev
```

- Landing: [http://localhost:3000](http://localhost:3000)
- Authoring workspace: [http://localhost:3000/app](http://localhost:3000/app)
- After **Publish Space**: [http://localhost:3000/p/product-docs](http://localhost:3000/p/product-docs)

Data persists in `data/store.json` (seeded on first read).

## What maps to Archbee

| Archbee | Documentalist |
| --- | --- |
| Spaces + nested docs / categories | Same model + drag reorder / nest |
| Slash `/` blocks + autosave | Floating slash menu, callouts, preview |
| Right Contents / Comments / SEO | Working side panel tabs |
| Publish Space to domain | Snapshot → `/p/{slug}` + dirty badge |
| Variables / snippets / templates | `{{key}}`, snippets, starter templates |
| Revision history | Autosave revisions + restore |
| Import / export Markdown | `.md` import + export |
| Portal password + custom CSS | Space settings |
| GitHub repo → Space | Import Markdown/MDX tree into a new Space |
| Version links | Snapshot Space versions + portal switcher |
| Localization | Locales per Space, translate docs, `?lang=` |
| Integrations | GitHub, GitLab, Slack, Discord, OpenAPI, webhook, Notion |
| Markdown flavors | Auto / CommonMark / GFM / MDX / Obsidian |
| Custom domain / AI Ask | Not in this MVP |

## GitHub import

In the workspace: **From GitHub**, or Integrations → GitHub. Use `owner/repo`, branch, and docs path. Public repos need no token; private repos need a PAT (saved on the GitHub integration).

## Stack

Next.js 15 (App Router) · TypeScript · TipTap · file-backed JSON store (no DB required).
