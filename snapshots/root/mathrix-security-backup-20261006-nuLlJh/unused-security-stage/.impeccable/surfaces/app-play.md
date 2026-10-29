---
version: 1
slug: "app-play"
primary_target: "app/play"
related_targets: ["app/layout.tsx", "app/style.css"]
---

# Play: matrix tactics

Mode: Operate. Target: app/play. Related surfaces: shared app shell and footer.
The user approved an app-wide light theme, an always-visible shared footer, and
tighter footer spacing during short matches. The landing page stays unchanged.

## Direction contract

THESIS: Both complete matrices and the shared operation tiles are the game. Keep
them visible together, as in the supplied desktop and phone sketches.

OWN-WORLD: Inherit the landing's white ground, dark ink, blue actions and Poppins.
Light green and red identify the two boards and tile ownership. Clean inset tile
frames, scope arrows, matrix icons and shortcut keys carry the supplied tile sketch.

STORY: Read scores and the active turn, select a tile, then its blue-outlined legal
target. Scope markers explain the effect before playing; help retains full rules.

FIRST VIEWPORT: On roomy desktops, profiles sit at the outer sides of the two
matrices above four columns and two rows of tiles. Portrait phones stack boards
above a scrolling tray. Compact windows scroll tiles beside Skip turn. Both
matrices, the tray and the legal/social footer share the viewport without overlap.

FORM: Brief-pinned matrix layout; code-led refinement of the existing app, with
no concept seed or generated comp. Signature interaction: selecting a tile reveals
its legal matrix targets without moving either board.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Quality bar

Match pc_layout.jpg, mobile_layout.jpg and tiledesign.jpg structurally. Keep dark
readable text on the light boards and tiles, 24px minimum matrix targets, complete
titles/descriptions, and accessible focus. Verify 1440x900, 1280x720, 1024x700,
1440x800, 390x844, 390x740, 360x640 and 844x390. Landing pixels, actions, and footer
content stay unchanged; every other route shares its palette and footer.
