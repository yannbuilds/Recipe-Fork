# Recipe Fork – Design System

Reference doc for the Recipe Fork design language. Use this when building new features or updating existing UI.

---

## Colour Palette

| Variable | Hex | Usage |
|----------|-----|-------|
| `--bg` | `#e9ede4` | Page background (soft sage green) |
| `--card` | `#ffffff` | Card/panel backgrounds |
| `--green` | `#3f7358` | Primary accent – buttons, links, active states |
| `--green-light` | `#edf3ef` | Light green tint – hover states, badges |
| `--warm` | `#f0ece6` | Warm beige – secondary surfaces, hover rows, stat tiles |
| `--warm-dark` | `#e0d9d0` | Darker warm tone – gradients, placeholders |
| `--border` | `#ebebea` | Borders, dividers, input outlines |
| `--text` | `#1c1c1a` | Primary text (near-black) |
| `--muted` | `#7a7a74` | Secondary text, labels, placeholders |
| `--red` | `#d94f3a` | Danger/delete actions, favourites heart |
| `--radius` | `16px` | Card border-radius |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.07)` | Nav bar, subtle elevation |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)` | Cards, panels |

Supplementary fixed colours (not tokenised):
- Danger hover bg: `#fef2f0`
- Danger border: `#f5c6c0`
- Green focus ring: `rgba(63,115,88,0.12)` at 3px spread

---

## Typography

| Role | Font | Weight | Size | Class |
|------|------|--------|------|-------|
| Page/section headings | Lora (serif) | 700 (bold) | 18–20px | `.rf-heading` |
| Body text | Nunito (sans-serif) | 400–500 | 14px (`text-sm`) | default |
| Small labels | Nunito | 400 | 12px (`text-xs`) | – |
| Category headers | Nunito | 700, uppercase | 12px | `uppercase tracking-wide text-xs font-bold` |
| Buttons | Nunito | 600 (semibold) | 14px | `.rf-btn` |

Google Fonts import (in `index.html`):
```
Lora: ital 0, weights 400/600/700; ital 1, weight 400
Nunito: weights 400/500/600/700
```

---

## Cards

All content panels use the `.rf-card` class:
```css
background: var(--card);
border-radius: var(--radius);   /* 16px */
box-shadow: var(--shadow-md);
```

Padding: `20px` for compact panels (ingredients sidebar), `24px` for main cards.

---

## Buttons

Four variants, all sharing the `.rf-btn` base:

| Variant | Class | Default | Hover | Use case |
|---------|-------|---------|-------|----------|
| Filled | `.rf-btn-filled` | Green bg, white text | Slight opacity reduce | Primary CTA (submit, save) |
| Primary | `.rf-btn-primary` | White bg, green border/text | Green-light bg | Secondary CTA (+ Meal Plan) |
| Secondary | `.rf-btn-secondary` | White bg, border, dark text | Warm bg | Neutral actions (Edit, Cancel) |
| Danger | `.rf-btn-danger` | White bg, pink border, red text | Pale red bg | Destructive actions (Delete) |

Base styles:
```css
border-radius: 10px;
padding: 10px 18px;
font-size: 14px;
font-weight: 600;
transition: 0.15s;
```

Small circular buttons (serving +/−):
- 28px circle, `--border` outline, `--muted` text
- Hover: border and text turn `--green`

---

## Inputs

All form inputs use `.rf-input`:
```css
border-radius: 10px;
border: 1px solid var(--border);
background: var(--card);
padding: 10px 14px;
font-size: 14px;
color: var(--text);
```
Focus: border `--green`, box-shadow `0 0 0 3px rgba(63,115,88,0.12)`

---

## Tags / Pills

`.rf-tag` for inactive, add `.rf-tag-active` for selected:

| State | Background | Border | Text |
|-------|-----------|--------|------|
| Inactive | `--card` | `--border` | `--muted` |
| Active | `--green` | `--green` | white |

Shape: `border-radius: 9999px` (full pill), `padding: 4px 12px`, `font-size: 12px`

---

## Tabs

`.rf-tabs` container with `.rf-tab` children:
- Container: `--warm` background, 10px radius, 4px padding
- Inactive tab: transparent bg, `--muted` text
- Active tab (`.rf-tab-active`): white bg, `--text` colour, `--shadow-sm`

---

## Layout

| Property | Value |
|----------|-------|
| Page max-width | `1100px` |
| Horizontal padding | `24px` |
| Top padding | `28px` |
| Bottom padding | `64px` |

Centred with `mx-auto`.

Two-column grid (RecipeDetail): `280px` sidebar + `1fr` content, `20px` gap. Collapses to single column at `≤768px`.

---

## Navigation

Frosted glass sticky nav bar:
```css
height: 56px;
position: sticky;
top: 0;
z-index: 50;
background: rgba(255,255,255,0.92);
backdrop-filter: blur(12px);
border-bottom: 1px solid var(--border);
box-shadow: var(--shadow-sm);
```

Nav link states:
- Active: `--green`, font-weight 600
- Inactive: `--muted`, hover `--text`

---

## Animations

Fade-up entrance:
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
```
Usage: `animation: fadeUp 0.4s ease both`
Stagger with `animation-delay`: 0s, 0.1s, 0.15s, 0.2s for sequential sections.

---

## Modals

- Backdrop: `fixed inset-0`, `bg-black/50`, `z-50`
- Card: `.rf-card`, `max-w-sm`, centred, `padding: 24px`
- Title: `.rf-heading`, `--text`
- Message: `text-sm`, `--muted`
- Buttons: Cancel = `.rf-btn-secondary`, Confirm = `.rf-btn-danger`

---

## Image Fallbacks

When no image is available, show a warm gradient placeholder:
```css
background: linear-gradient(135deg, var(--warm) 0%, var(--warm-dark) 100%);
```
With a centred `🍴` emoji.

---

## Hover States

- Cards: `translateY(-2px)` or `hover:-translate-y-0.5` (Tailwind)
- Ingredient rows: `background: var(--warm)`
- Buttons: see button variants table above
- Links: `hover:underline` or colour shift

---

## Checkboxes

Global accent colour set via:
```css
input[type="checkbox"] { accent-color: var(--green); }
```
