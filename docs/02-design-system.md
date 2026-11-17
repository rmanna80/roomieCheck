# HomePulse — Design System (Phase 2)

## 1. Three visual directions

### A. "Fridge Door"
The dashboard is a fridge door: Signals are paper notes and magnets, slightly rotated, with a
handwritten display face on cream paper and primary-colored magnet accents.

- **Strengths:** instantly reads as "home"; playful; memorable screenshots.
- **Weaknesses:** skeuomorphic notes get cluttered past ~6 items; rotated text hurts legibility and
  Dynamic Type; handwriting fonts fail accessibility; dark mode has no natural metaphor; easily tips
  into *childish*.

### B. "Porch Light"  ← **selected**
The app is lit the way a home is lit. Daylight is warm paper and ink; night is a lamp-lit umber
(not blue-black). Signals are solid, softly tinted slabs, each kind with its own *hearth color*, and
a **fuse** line along the bottom edge that shortens as the Signal approaches expiry. Housemates
appear as a row of **windows** that glow only when that person chooses to share a status.

- **Strengths:** warm without being cute; the fuse and windows are original, functional metaphors
  (time-boxing and opt-in presence); dark mode is a first-class "evening" mode, which matches when
  roommates actually coordinate; high contrast is easy to keep.
- **Weaknesses:** relies on color for kind identity → mitigated by glyph + label on every card;
  serif display face must be used sparingly to stay crisp at small sizes.

### C. "Floor Plan"
Architectural: blueprint grid, rooms drawn as plan tiles, Signals pinned to rooms, monospace labels.

- **Strengths:** superb for Space Windows; distinctive.
- **Weaknesses:** cold and administrative — the exact feeling the brief rejects; food and social
  Signals have no room to live in; dense diagrams are hard one-handed.

### Evaluation

| Criterion | Fridge Door | **Porch Light** | Floor Plan |
| --- | --- | --- | --- |
| Feels like home, not admin | ●●● | ●●● | ● |
| Not childish | ● | ●●● | ●●● |
| Legibility / accessibility | ● | ●●● | ●● |
| Dark mode quality | ● | ●●● | ●● |
| Scales from 2 → 8 housemates | ● | ●●● | ●● |
| Original metaphors that *do work* | ●● (notes) | ●●● (fuse, windows) | ●● (plan) |
| Build cost | ●● | ●●● | ● |

**Decision:** Porch Light, borrowing one idea from Floor Plan — spaces render as **room tiles** that
show "free now / next window".

## 2. Color

Tokens live in `src/theme/tokens.ts`. All text/background pairs below meet WCAG AA (≥ 4.5:1 for
body text, ≥ 3:1 for large text and UI glyphs).

| Token | Light ("daylight") | Dark ("lamp-lit") | Use |
| --- | --- | --- | --- |
| `bg` | `#F7F1E8` paper | `#17120F` umber | screen background |
| `surface` | `#FFFBF5` | `#221B16` | cards, sheets |
| `surfaceSunken` | `#EFE6D8` | `#2C241E` | inputs, wells |
| `ink` | `#2A211B` | `#F4EADF` | primary text |
| `inkMuted` | `#6B5D52` | `#B4A597` | secondary text |
| `line` | `#E3D7C6` | `#3A3029` | hairlines |
| `ember` | `#A84A24` | `#F08A5D` | primary action, focus |
| `onEmber` | `#FFFFFF` | `#1E130D` | text on ember |
| `danger` | `#B3261E` | `#F2B8B5` | destructive |
| `success` | `#2F6B45` | `#9ED3AE` | confirmations |

**Hearth colors** (Signal kinds). Each kind has a `tint` (card fill), `ink` (text/glyph on tint),
and `fuse` (fuse + accent):

| Kind | Light tint / ink | Dark tint / ink | Fuse |
| --- | --- | --- | --- |
| Food & Leftovers — saffron | `#F8E7C8` / `#6B4106` | `#3A2B14` / `#F3C579` | `#D9922B` |
| Run — sage | `#DDEBDD` / `#2A5234` | `#1F2E22` / `#A9D2B2` | `#5E8C6A` |
| Space — plum | `#E8DFF1` / `#45305E` | `#2B2236` / `#CDB8E6` | `#7A5C99` |
| Reset — teal | `#D8ECEB` / `#1C4F4F` | `#17302F` / `#9FD6D3` | `#3D8A8A` |
| Spark — coral | `#F8DDE1` / `#7D2133` | `#3A1C22` / `#F2A9B5` | `#D4566A` |
| Return — dusk | `#DEE5F3` / `#283F6B` | `#1C2433` / `#AFC3EA` | `#4F6FA8` |
| Quiet — slate | `#E4E2EC` / `#3A374F` | `#25232F` / `#C3C0D8` | `#6E6A86` |

Member colors (avatars/windows) are a fixed palette of 8 warm, distinguishable hues chosen by each
person — never assigned from behavior.

## 3. Typography

- **Display:** *Fraunces* (soft-serif, optical sizes) — screen titles, Signal headlines, numbers that
  matter (portion counts). Never below 18 pt.
- **UI/Body:** *DM Sans* — everything else.

| Style | Font | Size / line | Weight |
| --- | --- | --- | --- |
| `display` | Fraunces | 32 / 38 | 600 |
| `title` | Fraunces | 24 / 30 | 600 |
| `headline` | Fraunces | 19 / 25 | 500 |
| `body` | DM Sans | 16 / 23 | 400 |
| `bodyStrong` | DM Sans | 16 / 23 | 600 |
| `label` | DM Sans | 14 / 19 | 600 |
| `caption` | DM Sans | 13 / 18 | 400 |
| `micro` | DM Sans | 11 / 14 | 700, +0.6 tracking, uppercase |

Dynamic Type is respected everywhere (`allowFontScaling`); tab labels cap at 1.3×.

## 4. Spacing, shape, elevation

- 4-pt grid: `4, 8, 12, 16, 20, 24, 32, 40`. Screen gutters 20.
- Radii: chip 999 · input 14 · button 16 · card 22 · sheet 28.
- Elevation: none in dark mode; in light mode a single soft shadow (`0 6 18 / 6 % ink`) for floating
  elements only (the Signal button, toasts). Cards separate by tint, not shadow.
- Touch targets ≥ 44 × 44 pt; primary buttons 52 pt tall; response buttons 44 pt.

## 5. Components

| Component | Notes |
| --- | --- |
| `SignalCard` | Kind glyph stamp + micro label ("FOOD · 7:00 PM"), Fraunces headline, author + relative time, response summary ("3 in · 1 save"), inline one-tap responses, **fuse** along the bottom edge. Your own response is shown as a filled chip. |
| `Fuse` | 3-pt line in the kind's fuse color; length = remaining / total lifetime; static when Reduce Motion is on. Supplementary only — the expiry is always also stated in text ("ends 9:30"). |
| `Windows` (status strip) | One rounded square per housemate. Lit (member color glow + status label) only if they shared a status with you; otherwise a dim pane with their initial. No "hidden" vs "not set" distinction is exposed. |
| `ResponseBar` | 2–3 kind-specific choices; selected state uses kind ink on kind tint; changing your mind is one tap. |
| `ComposeSheet` | Kind grid (8 stamps) → one-screen form with smart defaults (next half-hour, typical duration) → *Send*. |
| `TimeChips` / `DurationChips` | Horizontal chips ("Now", "7:00", "7:30" … / "30m", "45m", "1h") — no native picker needed for 95 % of cases. |
| `RoomTile` | Space name, "Free now" / "Taken until 8:00", next agreed window. |
| `Button` | `primary` (ember), `secondary` (surface + line), `ghost`, `danger`; loading state keeps width. |
| `Chip`, `Avatar`, `TextField`, `Toggle row`, `SectionHeader`, `Toast` | Standard set built on tokens. |
| `EmptyState` / `ErrorState` / `Skeleton` | Every list has all three. Empty states suggest a first Signal instead of showing a void. |

## 6. Motion

Playful but restrained; all motion has a purpose.

- Cards enter with a 180 ms fade + 8 pt rise, staggered 30 ms (Reanimated layout animations).
- Press: scale to 0.97 over 100 ms; release springs back.
- Responding: the card border pulses once in the kind's fuse color (400 ms) + light haptic.
- Agreement reached / Spark becomes a plan: the stamp "settles" (scale 1.08 → 1) + success haptic.
- **Reduce Motion:** entering animations and pulses are disabled; state changes remain instant.

## 7. Empty, loading, error, conflict, success

- **Empty Home:** "Quiet house. Start something?" with three one-tap starters (Cooking, Run, Spark).
- **Loading:** skeleton cards in kind-neutral `surfaceSunken`, never spinners for lists.
- **Error:** plain sentence + *Try again*; mutations roll back optimistic state and show a toast.
- **Conflict (Space):** inline plum banner "Overlaps Jordan's 7:00–8:00 window" with up to three
  alternative times as chips.
- **Success:** toast + haptic; the affected card updates in place (no navigation jump).

## 8. Accessibility

- Every interactive element has `accessibilityRole` + `accessibilityLabel`; response buttons expose
  `accessibilityState={{ selected }}`.
- Signal cards are a single accessible element announcing kind, headline, time, and fuse remaining
  ("Food. Making tacos. At 7 PM. Expires in 2 hours.").
- Color is never the only carrier of meaning — every kind has a glyph and a text label.
- Contrast verified for all token pairs above; focus/selection uses both color and shape.
