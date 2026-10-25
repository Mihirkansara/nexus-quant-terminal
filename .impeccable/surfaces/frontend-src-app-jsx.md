---
version: 1
slug: "frontend-src-app-jsx"
primary_target: "frontend/src/App.jsx"
related_targets: ["frontend/src/pages/Dashboard.jsx"]
---

## Scope

Nexus Terminal app shell and all 28 desks (frontend/src/App.jsx, pages/Dashboard.jsx, components/*). Visitor mode: Operate. Audience: active options traders in long desktop sessions. Constraints: every feature, model, data path and the shared portfolio state survive; the NEXUS name is the only binding brand element. Login and landing are separate surfaces that inherit this world.

## Direction contract

THESIS: The book printed like currency. Nexus treats a trader's option book as an engraved security: figures set like serial numbers, states inked, method lines visible. It refuses the category default of a near-black panel grid with one neon accent and glowing edges.

OWN-WORLD: Deep intaglio green-black ground in three tinted layers; bone ink for text; one UV-violet ink owns selection, focus, active navigation and every live state; foil gold is reserved exclusively for the trader's own book (legs, book value, book series in every chart); green/red only for P&L sign; orange only for warnings. Hairline 1px rules, microtext rules (tiny repeated Greek names) as section dividers, Geist for UI, Geist Mono tabular numerals for every figure, Bodoni Moda only for desk titles. One signature: the live guilloche Book Seal, a rosette whose geometry is computed from the book's Greeks and redraws as legs change.

STORY: The trader sees their book first (seal, legs, Greeks), picks a desk from a grouped rail or Ctrl K, and reads the desk's lead figures before its charts; they trust the numbers because method and source lines sit under every panel.

FIRST VIEWPORT: Top bar 52px: NEXUS wordmark, pair select, spot in serial numerals with change, live indicator, Ctrl K search, UTC clock. Microtext rule under it. Left: 216px desk rail grouped Pricing / Volatility / Hedging & Risk / Structured / Flow & Macro / Live, active desk marked in UV ink. Then 296px book panel with the Book Seal, market params and legs in gold, edged by a gold foil strip. Main: desk title in Bodoni with method line, a segmented KPI strip of serial-set figures right-aligned, then panels.

FORM: Banknote security printing (intaglio, guilloche, microtext, serial numerals), candidate 5 of 7 on the ordered list; raises from orienteering (reserved book ink), metro (one live ink), botanical (shared scales), doujin (whole-cell desk index), j-card (shared right edge). seed:ea00ef8975d2b6a9

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
