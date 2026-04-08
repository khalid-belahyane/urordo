# CLAUDE.md — urordo Landing Page

## What this is
A standalone web landing page for the **urordo** desktop app (Tauri + Rust + React, Windows file organiser). Lives in `landing/` inside the main repo. Deployed separately to **Cloudflare Pages**.

---

## Psychological Journey (the design law)
Every section answers a silent user question. Do not add persuasion — remove resistance.

| Section | Silent question | Goal |
|---|---|---|
| Nav | — | Orientation |
| Hero | "Is this for me?" | Attention: bold promise |
| Game Stage | "Do they understand my problem?" | Recognition: live demo |
| What is urordo | "What do I actually gain?" | Desire: concrete benefits |
| Features | "Can this really do that?" | Desire: proof via detail |
| How It Works | "Is it complicated?" | Simplicity: 3 steps |
| Who Is It For | "Am I the right person?" | Trust: personas |
| CTA | "What happens if I act?" | Action: frictionless |
| Footer | "Is this trustworthy?" | Trust: legal, GitHub |

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 6 |
| Styling | Pure CSS (all custom, no framework) |
| Fonts | Google Fonts: Cormorant Garamond + DM Mono |
| Animations | Pure CSS keyframes + Intersection Observer + Canvas API |
| Deploy | Cloudflare Pages (static build) |

---

## Dev commands

```bash
cd landing
npm install      # first time only
npm run dev      # → http://localhost:5173
npm run build    # → dist/
npm run preview  # preview production build
npm run typecheck # TypeScript check, no emit
```

## Cloudflare Pages settings
- **Root directory**: `landing`
- **Build command**: `npm run build`
- **Output directory**: `dist`
- No environment variables required.

---

## Design System

### Colors (all via CSS custom properties — never hardcode hex)

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--paper` | `#f8f5ef` | `#1a1710` | Page background |
| `--paper2` | `#f2ede4` | `#211e14` | Subtle sections |
| `--paper3` | `#ece5d8` | `#28241a` | Card backgrounds |
| `--ink` | `#1a170f` | `#f0ead8` | Primary text |
| `--muted` | `#8c8474` | `#8c8474` | Secondary text |
| `--faint` | `#c8bfad` | `#4a4535` | Borders, hints |
| `--rule` | `#ddd5c4` | `#332f22` | Divider lines |
| `--gold` ✦ | `#8b6914` | `#c4933f` | **Primary accent** |
| `--green` | `#2e5e18` | `#4a9428` | Success only (game stage) |
| `--surface-dark` | `#1a170f` | `#100e09` | CTA/footer bg (always dark) |

✦ **Gold is the brand accent** — used for: logo italic O, heading `<em>` accents, CTA hover, nav download link, cursor hover, progress bar, folder counter, sweeper badge.

### Typography

```
Headings:  'Cormorant Garamond', serif   — weights 300, 600
Body/code: 'DM Mono', monospace          — weights 300, 400, 500
```

Hero headline: `clamp(52px, 8.5vw, 124px)` Cormorant weight 300
Section h2s:   `clamp(34px, 4.5vw, 60px)` Cormorant weight 300
Body copy:     `13px` DM Mono, `line-height: 1.85–1.9`
Labels/tags:   `9–11px` uppercase, `letter-spacing: .14em–.28em`

### Spacing rhythm
- Major sections: `padding: 120px 52px`
- Two-column grids: `gap: 80px`
- Feature/rule rows: `padding: 28px 0`
- Mobile (≤ 900px): section padding → `80px 24px`

---

## File Structure

```
landing/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html              ← meta, OG tags, font preconnects
├── public/
│   └── favicon.svg         ← folder-search SVG in gold
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css           ← ALL styles (~950 lines)
    └── pages/
        └── LandingPage.tsx ← ALL sections + game logic + modals
```

---

## How to update the download version

In `src/pages/LandingPage.tsx`, line 4:
```ts
const VERSION = '0.0.2';  // ← change this
const DL_URL  = 'https://github.com/urordo/urordo/releases/latest';
```
`VERSION` appears in: nav stamp, CTA button text, footer version.
`DL_URL` appears in: hero download button, CTA button.

For a direct `.exe` link once assets are published:
```ts
const DL_URL = `https://github.com/urordo/urordo/releases/download/v${VERSION}/urordo_${VERSION}_x64-setup.exe`;
```

---

## How to add a new section

1. Write the HTML in `LandingPage.tsx` — give the section an `id` for nav anchoring.
2. Add CSS in `src/index.css` under a clearly labelled block comment.
3. Use **only** `var(--token)` for colors — never hardcode hex.
4. Add `.rv` or `.rv-left` class to elements you want to reveal on scroll (the Intersection Observer picks them up automatically).
5. Add `.d1`–`.d5` delay classes to stagger multiple children.
6. Add a nav link in the `<nav>` if the section warrants it.

---

## Dark mode implementation

Dark mode is **automatic** via `@media (prefers-color-scheme: dark)`. All CSS custom properties redefine themselves in that media query. The `[data-theme="dark"]` and `[data-theme="light"]` attribute selectors allow manual override if a toggle button is added later.

The **CTA and footer** sections always appear dark using `var(--surface-dark)` — a separate token that shifts between `#1a170f` (light mode) and `#100e09` (dark mode) so they always provide contrast.

---

## CSS conventions

- All sections separated by `/* ══ SECTION NAME ══ */` block comments
- Component classes follow BEM-lite: `.s-about`, `.about-h`, `.about-body`
- Cursor uses `cursor: none` on all interactive elements (custom cursor via JS)
- Chip file-type colours are hardcoded hex (they represent physical file categories, not UI tokens)
- `will-change: transform, opacity` on `.chip` elements only (GPU hint for game stage)

---

## Performance notes

- No external JS dependencies (pure React + browser APIs)
- Canvas particle effects use `requestAnimationFrame` and are cleaned up on unmount
- Intersection Observer disconnects after each element is revealed
- Fonts loaded via `<link rel="preconnect">` + Google Fonts `display=swap`
- Game stage chips use `position: absolute` + CSS `transition` (no JS animation libraries)

---

## Legal

Both **Terms of Service** and **Privacy Policy** are embedded in `LandingPage.tsx` as `TermsContent` and `PrivacyContent` components. They open in a modal overlay.

Key protections in place:
- "As is" warranty disclaimer
- Full limitation of liability clause
- Clear statement that all data is local-only
- Smart Mode is explicitly opt-in with user's own API key
- Auto-update privacy disclosure
- No children's data collection statement

To update legal content: edit `TermsContent()` and `PrivacyContent()` at the bottom of `LandingPage.tsx`. Always update the "Last updated" date.
