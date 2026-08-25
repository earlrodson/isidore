# UI/UX Improvement Plan — apps/web

## Current state

`apps/web` renders raw semantic HTML (`<table>`, `<form>`, native `<input>`/`<button>`) styled by
a single hand-written `globals.css`. There is no Tailwind, no component library, and no design
tokens — every page (`page.tsx`, `onboarding/page.tsx`, `projects/[provider]/[...repoId]/page.tsx`)
repeats its own inline table/list markup and system-default form-control styling.

## Target stack

| Layer | Choice | Why |
|---|---|---|
| Utility CSS | **Tailwind v4** | CSS-native theming via `@theme`/CSS variables (no config file), zero runtime cost, plugs directly into Next.js's built-in PostCSS pipeline. |
| Components | **shadcn/ui** (Radix primitives, copied into the repo) | Components live in `apps/web/src/components/ui/*` as plain code we own — no black-box runtime styling engine to fight, easiest to theme against a custom palette, current de facto standard for Next.js App Router apps (used internally at Vercel). |
| Animation | **Motion** (`motion/react`, formerly Framer Motion) | Same team/API lineage as Framer Motion; gives layout animations, hover/press micro-interactions, and page/section transitions that shadcn's static components don't include on their own. |
| Icons | **lucide-react** | shadcn's default icon set, tree-shakeable, matches component stroke width out of the box. |

This mirrors the earlier discussion in this session: shadcn/ui was chosen over Tamagui (no
React Native target here — Tamagui's cross-platform compiler buys nothing) and over Mantine/Chakra
(their CSS-in-JS runtime + bespoke theming DSL is heavier than needed and harder to map onto a
custom CSS-variable palette than Tailwind tokens).

## Components to introduce (and why)

| Component | Replaces | Why |
|---|---|---|
| `Table` (`table.tsx`) | raw `<table>` in `page.tsx` (projects, completions, drift, allocation) | Consistent header/row styling, built-in hover/zebra states, keeps semantic `<table>` markup (no a11y regression) but themeable via tokens. |
| `Card` | ad-hoc `<section>` blocks in `onboarding/page.tsx` | Groups each GitHub installation/repo into a bounded, elevated surface instead of unstyled `<section>` stacking. |
| `Button` | native `<button>` in forms (scaffold, rotate secret, update CI snippet) | Consistent sizing/variant (primary/secondary/destructive) and built-in loading/disabled states; wraps Motion press feedback. |
| `Input` / `Label` / `Form` | native `<input>`/`<label>` (branch name fields, path field) | Consistent focus rings, error states, and spacing; `Form` gives client-side validation hooks for later. |
| `Badge` | plain text status (`params.scaffolded === "exists"`, error/success messages) | Turns inline text status into a colored, scannable pill (success/warning/error variants mapped to palette). |
| `Alert` | bare `<p>` for `params.error` / PR-opened messages | Distinguish success vs error feedback visually instead of identical paragraphs. |
| `Skeleton` | (new) | For the `force-dynamic` data-fetch waterfalls on `page.tsx`/`onboarding` — perceived-performance win while `Promise.all` resolves. |
| `Tabs` | (new, optional) | Split the homepage's four stacked tables (`projects`, `completions/week`, `drift`, `allocation`) into tabs so the dashboard reads as one view, not four scrolling tables. |
| `Collapsible`/`Accordion` | native `<details>` (CI snippet block) | Same disclosure behavior as today's `<details>`, but animated (Motion height transition) and themeable. |
| `Sonner` (toast) | none today | Form submissions (`scaffold`, `secret`, CI snippet update) currently round-trip via full page reload with query-string flags — a toast gives immediate feedback without waiting on that plan's follow-up navigation work. |

## Color palette

Extracted from the supplied swatch (pastel fields separated by gold rules):

| Token | Hex | Role |
|---|---|---|
| `--gold` | `#C9A24B` | Primary accent — links, primary buttons, focus rings, active tab indicator, borders on emphasis elements |
| `--gold-foreground` | `#2A2210` | Text placed on top of `--gold` |
| `--cream` | `#F3EFD9` | Page background (light mode), subtlest surface |
| `--sage` | `#DCE0D0` | Muted/secondary surface (e.g. table header background, disabled states) |
| `--mint` | `#E3F7F1` | Success/positive surface (success `Badge`/`Alert`) |
| `--blush` | `#E8D8E4` | Highlight surface (hover row, selected `Tabs` panel) |
| `--periwinkle` | `#D7D6E8` | Secondary accent — secondary buttons, info `Badge`/`Alert`, chart series 2 |

Mapped onto shadcn's standard token contract (`background`, `foreground`, `card`, `primary`,
`secondary`, `muted`, `accent`, `destructive`, `border`, `ring`) with light **and** dark variants,
since `globals.css` already declares `color-scheme: light dark`:

```css
:root {
  --background: var(--cream);
  --foreground: #2a2410;
  --card: #ffffff;
  --card-foreground: #2a2410;
  --primary: var(--gold);
  --primary-foreground: var(--gold-foreground);
  --secondary: var(--periwinkle);
  --secondary-foreground: #2a2410;
  --muted: var(--sage);
  --muted-foreground: #5c5a4a;
  --accent: var(--blush);
  --accent-foreground: #2a2410;
  --destructive: #c0524b; /* off-palette, kept low-saturation to match pastel set */
  --success: var(--mint);
  --border: color-mix(in srgb, var(--gold) 35%, var(--sage));
  --ring: var(--gold);
}

:root[data-theme="dark"] {
  --background: #1c1a12;
  --foreground: #f3efd9;
  --card: #26231a;
  --card-foreground: #f3efd9;
  --primary: var(--gold);
  --primary-foreground: #2a2210;
  --secondary: #35334a;
  --secondary-foreground: #e8e7f2;
  --muted: #2e2c22;
  --muted-foreground: #b8b49c;
  --accent: #3a3040;
  --accent-foreground: #f0e6ec;
  --destructive: #e0736c;
  --success: #234a3e;
  --border: color-mix(in srgb, var(--gold) 25%, #35342a);
  --ring: var(--gold);
}
```

These become Tailwind theme colors via `@theme inline { --color-primary: var(--primary); ... }` in
`globals.css`, so components reference `bg-primary text-primary-foreground` etc. rather than raw hex.

## Phased rollout

1. **Foundation** — add `tailwindcss`, `postcss`, `@tailwindcss/postcss` deps; replace
   `globals.css` with Tailwind directives + the token block above; add `postcss.config.mjs`.
2. **shadcn init** — run the shadcn CLI against `apps/web`, generate `components.json`, add
   `button`, `card`, `table`, `input`, `label`, `badge`, `alert`, `skeleton`, `tabs`,
   `collapsible`, `sonner`. Wire the palette in as the CLI's theme step.
3. **Motion pass** — add `motion` dep; wrap `Button` press states, `Tabs` panel transitions, and
   the CI-snippet `Collapsible` with simple layout/opacity animations.
4. **Page migration** (one PR per page to keep diffs reviewable):
   - `page.tsx` → `Table` + `Tabs` for the four dashboard sections.
   - `onboarding/page.tsx` → `Card` per installation, `Button`/`Input`/`Label` in forms,
     `Badge`/`Alert` for status messages, `Collapsible` for the CI snippet, `Sonner` for form
     submit feedback.
   - `projects/[provider]/[...repoId]/page.tsx` → audit once the above land (not yet inspected
     in detail — needs its own pass since its current markup wasn't reviewed for this plan).
5. **Cleanup** — delete now-unused rules from the old `globals.css`, confirm dark mode via
   `prefers-color-scheme` + manual toggle both render correctly, run `pnpm -r lint`/`typecheck`.

## Explicitly out of scope for this plan

- No React Native / Tamagui — this app is web-only.
- No CSS-in-JS runtime library (Mantine/Chakra) — conflicts with the zero-runtime Tailwind choice.
- No redesign of data/queries — this is presentation-layer only; `@isidore/db` query shapes are
  unchanged.
