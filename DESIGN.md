---
name: Nexus Terminal
description: An options terminal set like an engraved security note; green-black intaglio ground, bone ink, one UV ink for state, foil gold for the trader's own book.
colors:
  ground: "#09130f"
  ground-raised: "#0c1814"
  ground-3: "#0f1e18"
  ground-4: "#14271f"
  well: "#07100c"
  panel: "#0d1a15"
  panel-hover: "#11211a"
  surface-2: "#122219"
  note-ground: "#0d1d17"
  bone: "#ebe5d3"
  text-secondary: "#c3c8b9"
  text-dim: "#9eab9f"
  text-muted: "#84948a"
  text-faint: "#76877d"
  rule: "#1c2e26"
  rule-strong: "#2a4137"
  rule-faint: "#15251e"
  microtext-ink: "#2c4a3e"
  uv: "#a99aff"
  uv-light: "#bbaeff"
  uv-on: "#120d2b"
  foil: "#ddb05a"
  pos: "#4fc690"
  neg: "#ee6b5b"
  warn: "#f0914a"
  intaglio-blue: "#86abea"
  mauve: "#d58fc0"
  chart-bone: "#e4dcc3"
  chart-axis: "#7e8f84"
  plot-well: "#0a1511"
  hover-plate: "#0f1d18"
typography:
  display:
    fontFamily: "'Bodoni Moda Variable', 'Bodoni Moda', serif"
    fontSize: "clamp(36px, 4.6vw, 64px)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.012em"
  headline:
    fontFamily: "'Bodoni Moda Variable', 'Bodoni Moda', serif"
    fontSize: "clamp(30px, 3.4vw, 44px)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.008em"
  title:
    fontFamily: "'Bodoni Moda Variable', 'Bodoni Moda', serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.005em"
  body:
    fontFamily: "'Geist Variable', 'Geist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'ss01', 'cv11', 'tnum'"
  body-lede:
    fontFamily: "'Geist Variable', 'Geist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Geist Variable', 'Geist', ui-sans-serif, system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.14em"
  figure:
    fontFamily: "'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "0.05em"
    fontFeature: "'tnum'"
  figure-inline:
    fontFamily: "'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0.01em"
    fontFeature: "'tnum'"
  greek:
    fontFamily: "'GFS Didot', 'Bodoni Moda Variable', serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1
  microtext:
    fontFamily: "'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace"
    fontSize: "6px"
    fontWeight: 600
    lineHeight: "10px"
    letterSpacing: "0.22em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  xl: "12px"
  note: "16px"
spacing:
  sp-1: "4px"
  sp-2: "8px"
  sp-3: "12px"
  sp-4: "16px"
  sp-5: "20px"
  sp-6: "24px"
components:
  button-primary:
    backgroundColor: "{colors.uv}"
    textColor: "{colors.uv-on}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.uv-light}"
    textColor: "{colors.uv-on}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    padding: "6px 11px"
  button-ghost-hover:
    textColor: "{colors.bone}"
  input-field:
    backgroundColor: "{colors.well}"
    textColor: "{colors.bone}"
    typography: "{typography.figure-inline}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  input-leg:
    backgroundColor: "{colors.well}"
    textColor: "{colors.foil}"
    rounded: "{rounded.sm}"
    padding: "5px 6px"
  rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "5px"
    padding: "6px 8px"
  rail-item-hover:
    backgroundColor: "{colors.ground-4}"
    textColor: "{colors.bone}"
  segmented-active:
    backgroundColor: "{colors.ground-4}"
    textColor: "{colors.bone}"
    rounded: "{rounded.sm}"
    padding: "5px 10px"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
  kpi-cell:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.bone}"
    typography: "{typography.figure}"
    padding: "11px 14px 10px"
  book-seal-card:
    backgroundColor: "{colors.ground-3}"
    textColor: "{colors.foil}"
    rounded: "{rounded.lg}"
    padding: "12px"
  badge:
    rounded: "{rounded.sm}"
    typography: "{typography.label}"
    padding: "2px 6px"
  top-bar:
    backgroundColor: "{colors.ground-raised}"
    height: "52px"
  desk-title:
    textColor: "{colors.bone}"
    typography: "{typography.title}"
---

# Design System: Nexus Terminal

## Overview

**Creative North Star: "The Intaglio Note"**

Nexus is printed, not lit. The whole terminal reads as a security note: a deep green-black ground laid in close tonal layers, text in warm bone ink, and the hallmarks of banknote engraving put to work as interface — guilloche rosettes, microtext rules, serial-set numerals, hairline frames. Nothing glows. Depth comes from tone and 1px rules, and colour is spent like a scarce ink: each hue has one job and is not borrowed for another.

The density is a trading desk's. Root type is 13px, desk content sits at 12.5px, and every figure is set in tabular mono so columns align without effort through a long session. Desks open on a Bodoni title with a one-line method under it, then a ruled KPI band of right-aligned figures, then the panels. The trader's own book (its legs, value and Greeks) is the only thing ever inked in foil gold, so the eye can find "mine" on any screen in one glance.

The one signature object is the Book Seal: a guilloche rosette computed from the book's delta, gamma and vega, which redraws with a 0.7s morph as legs change. It appears in the book panel, as the NEXUS mark, and large on the landing and sign-in notes, where it engraves itself in on load.

**Key Characteristics:**
- Green-black intaglio ground in tinted layers; flat, tone-separated surfaces with 1px rules.
- Bone ink text on a five-step ramp, every step at or above 4.5:1 on the ground.
- One UV-violet ink for selection, focus, active navigation and live state.
- Foil gold reserved for the trader's book; green and red only for sign; orange only for warnings.
- Geist for interface, Geist Mono tabular numerals for every figure, Bodoni Moda for titles, GFS Didot for Greek symbols.
- Security-print devices as structure: microtext rules, guilloche seals, foil edge strips, serial numerals.

## Colors

A low-chroma green-black ground carrying bone ink, with five single-purpose inks laid over it.

### Primary
- **UV Ink** (`uv`): the state ink. Focus outlines (1.5px, 2px offset), the active rail item's icon and 1.5px edge tick, the live dot and its expanding ring, selection highlight (34% mix), caret, range and checkbox accents, primary buttons, and the confidence-bar fill. Tints of it (9–14% mixes) fill the selected states of ghost buttons, rail items and palette cells.
- **UV Bright** (`uv-light`): primary-button hover only.
- **UV Counter-ink** (`uv-on`): the deep violet-black label colour set on UV fills.

### Secondary
- **Foil Gold** (`foil`): the trader's own book and nothing else. Book value and Greeks in the seal card, leg inputs (text and a 16% foil-tinted border, foil focus ring), the book's Greek figures on the Greeks desk, hatched contribution bars, the book's payoff line in charts, the Book Seal's strokes, the 2px metallic edge strip on the book panel, and the frames of the landing and sign-in notes.

### Tertiary
- **Intaglio Blue** (`intaglio-blue`): the first neutral market series in charts, and the legacy "purple" badge family.
- **Mauve** (`mauve`): the second neutral series (puts, implied vol, short gamma, alternative models).
- **Chart Bone** (`chart-bone`): the lead non-book series in Plotly charts, and markers and annotations that must read as ink rather than signal.
- **Gain Green** (`pos`) and **Loss Red** (`neg`): P&L sign, signed changes on the tape and top bar, bullish/bearish badges, error notices and destructive hover (leg delete).
- **Warning Orange** (`warn`): medium-impact events, neutral signal badges and cautions.

### Neutral
- **Intaglio Ground** (`ground`): page and book-panel background.
- **Raised Ground** (`ground-raised`): top bar, rail, tape, microtext band, palette dialog.
- **Third and Fourth Layers** (`ground-3`, `ground-4`): cards inside panels and hovered rows; `ground-4` also marks hovered rail items, the active segment and the toast.
- **Well** (`well`): recessed fields — inputs, the search trigger, segmented-control trays, contribution-bar tracks.
- **Panel** (`panel`, `panel-hover`, `surface-2`): desk panels and KPI bands, with their hover steps.
- **Note Ground** (`note-ground`): the face of the landing note, close band and sign-in face, under the engraved wave field.
- **Bone** (`bone`): primary text and figures. Ramp below it: `text-secondary` for labels and section titles, `text-dim` for supporting copy, `text-muted` for units, captions and uppercase labels, `text-faint` for placeholders and the lowest tier.
- **Rules** (`rule`, `rule-strong`, `rule-faint`): 1px panel borders and dividers; `rule-strong` for field borders and table-header underlines; `rule-faint` for row separators.
- **Microtext Ink** (`microtext-ink`): the tiny repeated Greek-name line under the top bar. Decorative and `aria-hidden`; never used for readable text.
- **Plot Well, Hover Plate, Chart Axis** (`plot-well`, `hover-plate`, `chart-axis`): Plotly plot background, hover-label fill and axis/baseline-series colour. Plotly cannot read CSS variables, so charts carry these as literals alongside `rule` for gridlines.

### Named Rules
**The One Live Ink Rule.** UV is the only colour that means "selected, focused, active or live". Never paint state in green, gold or blue. Inside desk bodies the legacy `--cyan` token resolves to bone, so old emphasis code cannot leak UV into content.

**The Foil Is Mine Rule.** Foil gold marks the trader's own book: legs, book value, book Greeks, the book's series in a chart. Market data, other models and decoration never take it, apart from the seal and the note frames that are the book's emblem.

**The Sign-Only Rule.** Green and red say whether a number is up or down, a gain or a loss. They are not brand colours, not section accents, not success/failure chrome beyond notices. Orange only warns.

## Typography

**Display Font:** Bodoni Moda Variable (serif fallback)
**Body Font:** Geist Variable (with ui-sans-serif, system-ui)
**Label/Mono Font:** Geist Mono Variable (with ui-monospace, SF Mono, Cascadia Code)
**Greek Symbol Font:** GFS Didot (with Bodoni Moda)

**Character:** A high-contrast Didone for the engraved titles against a neutral grotesk and its mono twin for everything a trader reads at speed; the serif is ceremony, the mono is the ledger.

### Hierarchy
- **Display** (Bodoni 600, clamp(36px, 4.6vw, 64px), 1.04, −0.012em): landing hero headline, balanced, max 15ch.
- **Headline** (Bodoni 600, clamp(30px, 3.4vw, 44px), 1.08): landing section heads; the sign-in heading at 32px.
- **Title** (Bodoni 600, 28px, 1; 22px under 820px): the desk title, followed by a 12px `text-muted` method line naming model, source and desk group.
- **Body** (Geist 400, 12.5px in desks; 13px root): desk prose and labels. Landing lede 16.5px/1.6 at max 58ch; section copy 15.5px/1.6 at max 52ch.
- **Label** (Geist 600, 10–11px, 0.1–0.16em, uppercase): rail group names, panel headers, book-panel section heads, table headers (10.5px, 0.06em). `text-muted` or `text-secondary`; the book's seal title is the one foil exception.
- **Figure** (Geist Mono 500, 15–22px, tabular, 0.05em "serial" tracking): KPI values (clamp(15px, 1.25vw, 19px)), Greek values (20–22px), spot in the top bar (21px with thin-space grouping).
- **Figure Inline** (Geist Mono 500, 11.5–12.5px, tabular): table cells, inputs, tape rates, row values.
- **Greek** (GFS Didot, 15–22px; 34px in landing note corners): every Greek letter — Δ Γ ν Θ ρ φ σ and parameter symbols — in labels, seal readouts and sliders.

### Named Rules
**The Serial Numeral Rule.** Every number a trader acts on is set in Geist Mono with tabular figures and right-aligned in its cell. Signs use a true minus (−), not a hyphen.

**The Didot Greek Rule.** Greek glyphs are always set in GFS Didot, never in Bodoni Moda, whose math-subset Δ loses its hairline base at interface sizes.

**The Titles-Only Serif Rule.** Bodoni Moda sets desk titles and entry-surface headlines only. It never sets body copy, labels or figures.

## Layout

A fixed application shell, not a scrolling page. The top bar is 52px: seal mark and tracked NEXUS wordmark (0.34em), instrument select, spot in serial numerals with signed change, live indicator, Ctrl K search trigger, refresh, UTC clock, sign-out. Beneath it run a 10px microtext band and a 28px scrolling market tape (rates, then the day's medium/high-impact events), edge-faded with a mask.

Below, three columns: the desk rail (220px; 196px under 1280px; a 56px icon-only rail under 1080px; hidden under 820px), the book panel (316px; 300px under 1280px; an off-canvas drawer toggled from the top bar under 820px), and the desk area, which alone scrolls. Desk content is padded 18px 24px; panels sit on 12–16px gaps in auto-fit grids (minimum track 240–380px).

The KPI strip is one ruled band whose cells share label, figure and sub-line rows through CSS subgrid, so figures share a baseline even when a label wraps. Column counts always fill rows: up to six across when wide, the largest divisor of the count at most four under 1360px, two under 760px.

Spacing runs on a 4px base (4, 8, 12, 16, 20, 24). Entry surfaces centre on a 1240px measure with 96px section spacing (64px on phones) and a 16px side gutter under 720px.

## Elevation & Depth

Depth is tonal. Surfaces step up through the ground layers and are separated by 1px rules; shadows are faint and structural, appearing on panels as a barely-there inset top highlight with a soft drop, and only becoming pronounced on things that genuinely float (toast, desk index, off-canvas book). The entry-surface notes use a printed double frame: a 6px ground-coloured gap and a 1px foil hairline around the note, then a long soft drop.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 0 rgba(235,229,211,0.025) inset, 0 6px 18px -10px rgba(0,0,0,0.6)`): every desk panel.
- **Primary button** (`box-shadow: 0 1px 0 rgba(255,255,255,0.25) inset, 0 2px 6px -2px rgba(0,0,0,0.5)`): the UV action only.
- **Toast** (`box-shadow: 0 10px 30px -8px rgba(0,0,0,0.7)`): transient confirmations.
- **Desk index** (`box-shadow: 0 30px 80px -20px rgba(0,0,0,0.85)`): the Ctrl K palette over a 72% ground scrim.
- **Note frame** (`box-shadow: 0 0 0 6px var(--bg), 0 0 0 7px color-mix(in srgb, var(--foil) 18%, transparent), 0 40px 80px -40px rgba(0,0,0,0.85)`): landing hero note and sign-in note.

### Named Rules
**The No-Glow Rule.** Nothing emits light. No neon edges, coloured drop shadows or blurred halos; focus is a crisp 1.5px UV outline and inputs take a 3px 18% UV ring.

## Shapes

Gently rounded, engraved-plate geometry. Fields and badges take 4px, buttons and controls 6px, panels and the KPI band 10px, the desk index and proof plates 12px, and the entry-surface notes 16–18px. Edges are 1px hairlines throughout; the former thick accent bars are reduced to a 1px coloured left rule. Bars and ticks are thin: 1.5px tab underline, 1.5px rail tick, 2px foil edge strip, 3px impact bars, 4px confidence bars. Circular forms are reserved for the seal, live dots and slider thumbs.

## Components

### Buttons
Tactile but quiet; one loud action per view.
- **Shape:** gently rounded (6px); entry-surface CTAs 8px.
- **Primary:** UV fill with UV counter-ink label, 550 weight, 12px, 8px 14px padding.
- **Hover / Focus:** UV-bright fill on hover; presses down 1px on active; 1.5px UV focus outline; disabled at 45% opacity.
- **Ghost:** transparent with a `rule-strong` border and `text-secondary` label; hover and pressed states take a UV-tinted border and fill with bone text.
- **Tab:** text-only, `text-muted`, with a 1.5px UV underline when active.
- **Icon button:** 32px square, transparent until hover, then `ground-4` with a rule border.

### Segmented Control
- **Style:** a `well` tray with a `rule-strong` border and 2px inset; options 12px `text-dim`.
- **State:** the pressed option sits on `ground-4` with an inset `rule-strong` ring and bone text.

### Badges
- **Style:** 10px uppercase Geist 600 at 0.07em, 4px radius, a 9% tint fill with a 35% tint border of the same ink. Signal badges (bullish/bearish/neutral) are the 12px larger sibling.
- **State:** high = red, medium = orange, low = ground-3 with muted text; UV, green and blue variants follow the ink rules above.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** `panel`; hover lifts to `panel-hover` with `rule-strong` border where interactive.
- **Shadow Strategy:** the Panel shadow (see Elevation & Depth).
- **Border:** 1px `rule`.
- **Internal Padding:** headers 9px 14px with an uppercase label and a bottom rule; bodies 12–16px; rows 8px 14px divided by `rule-faint`.

### Inputs / Fields
- **Style:** `well` fill, 1px `rule-strong` border, 4px radius, Geist Mono 12px tabular, bone text; numeric spinners removed; selects use the UI face with a drawn chevron.
- **Focus:** UV border plus a 3px 18% UV ring. Leg inputs in the book panel use foil instead.
- **Error / Disabled:** errors are a red notice block (9% red fill, 35% red border, red text); disabled fields drop to 50% opacity.

### Navigation
- **Desk rail:** groups (Pricing, Volatility, Hedging & Risk, Structured, Flow & Macro, Live) under 10px uppercase labels; items are 13px `text-secondary` with a 15px lucide icon at 1.7 stroke. Hover: `ground-4` and bone. Active: an 11% UV wash, UV icon and a 1.5px UV tick on the rail's left edge. Collapses to icons under 1080px.
- **Desk index (Ctrl K):** an 880px dialog with a 15px search field and a whole-cell grid of desks (three columns, then two, then one), each cell showing name and one-line method; the active cell takes a UV wash and border.
- **Market tape:** a 60s continuous scroll that pauses on hover; pair names in 11px Geist, rates in mono, events marked by a 6px square in impact colour.

### KPI Strip
The ruled band every desk leads with: labels top-left in 11.5px `text-secondary`, figures right-aligned in serial mono on a shared baseline, a mono sub-line beneath; colour on a figure only for sign or warning.

### Book Seal
A 84px guilloche rosette (four foil strands, a three-line outer band, a two-line bone core, a foil centre with a ground pupil) inside a 10px card washed with 6% foil. Petal count follows |delta|, petal depth and harmonic follow gamma, strand spacing follows vega; paths animate their `d` over 0.7s on the standard ease. Beside it: the uppercase foil "Book · PAIR" title, the signed book value in 17px foil serial numerals, and a Didot-labelled Greek readout. On entry surfaces the larger seal draws its strokes in over 1.8s.

### Microtext Rule
A 10px band of 6px mono capitals repeating the Greek names, tracked 0.22em in `microtext-ink`, used as the divider under the top bar and as the top and bottom rules of the landing note (7px, foil at 42%).

## Do's and Don'ts

### Do:
- **Do** lead every desk with its title, method line and a KPI strip before any chart.
- **Do** set every actionable figure in Geist Mono tabular numerals, right-aligned, with a true minus sign.
- **Do** keep UV for selection, focus, active navigation and live state, and nothing else.
- **Do** ink the trader's own book in foil gold wherever it appears, including its series in charts.
- **Do** separate surfaces with ground-layer tone and 1px rules; reserve real shadows for floating layers.
- **Do** set Greek letters in GFS Didot.
- **Do** honour `prefers-reduced-motion`; the build collapses all animation and transition to 0.01ms.
- **Do** use the standard ease (cubic-bezier(0.16, 1, 0.3, 1)) at 0.14s for controls, 0.2s for panels and 0.22s for the desk entrance (fade plus 4px rise).

### Don't:
- **Don't** use foil gold for market data, other models, headings or decoration unrelated to the book.
- **Don't** use green or red for anything but sign, or orange for anything but warnings.
- **Don't** add glows, neon edges, coloured shadows or thick left accent bars on panels; panel edges are 1px hairlines.
- **Don't** set body copy, labels or figures in Bodoni Moda, or Greek glyphs in Bodoni Moda.
- **Don't** colour uppercase labels; they stay `text-muted` or `text-secondary`, except the book's own title in foil.
- **Don't** set readable text in `microtext-ink`; microtext is ornament and stays `aria-hidden`.
