---
version: 1
slug: "app-play"
primary_target: "app/play"
related_targets: ["app/layout.tsx", "app/style.css"]
---

# Play: matrix tactics

Mode: Operate. Target: app/play. Related surfaces: shared app shell and footer.
The user approved an app-wide light theme, portrait game cards and compact
matrices. Active matches and Practice hide the footer and restore it on results.
The landing page stays unchanged.

## Direction contract

THESIS: Both complete matrices and the shared operation tiles are the game. Keep
them visible together, as in the supplied desktop and phone sketches.

OWN-WORLD: Inherit the landing's white ground, dark ink, blue actions and Poppins.
Light green and red identify the two boards and tile ownership. Matte textured
portrait cards have green/red gradients with stable per-card angles and strengths;
mixed cards remain exactly 50/50. Inset frames, scope arrows and matrix icons
carry the supplied tile sketch. Locked slots look recessed with inset bevels.

STORY: Read scores and the active turn, select a tile, then its blue-outlined legal
target. Scope markers explain the effect before playing; help retains full rules.

FIRST VIEWPORT: Desktop profiles sit separately at the matrices' outer sides,
centered with larger names and 64px avatars. Boards and tray share outer widths
and gutters. The portrait 3:4 tile grid fits as many columns as the width permits,
with 172px minimum slots, 24px gaps and internal vertical scrolling when needed.
Below 1024px, both matrices stay side by side with names, scores, destroyed total
and Maximum Square/Cube; avatar buttons open player details. Mobile and desktop
windows at most 800px high use one horizontal row of 132×176px portrait cards
with 16px gaps. Short mobile landscape screens at most 500px high put boards
left and tray right. Cells stay between 24px and 44px. Skip turn is at least 44px
high, above the desktop tray and beside You in the mobile matrix header.

INTERACTION: Q skips using the same guarded action as the button. Mobile card,
axis/matrix and Q keys and gameplay keyboard guidance default to hidden; a
browser-local Preferences checkbox enables them together. Desktop hints remain
visible, and shortcuts still work when hints are hidden. Native player-details
dialogs retain identity, location, rank, games and game statistics; Close or
Escape restores focus. Online clocks continue; Practice AI pauses and protection
timers continue, matching existing dialogs.

FORM: Brief-pinned matrix layout; code-led refinement of the existing app, with
no concept seed or generated comp. Signature interaction: selecting a tile reveals
its legal matrix targets without moving either board.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Quality bar

Use the supplied sketches for identity and scope markers, with the updated
portrait-card and side-by-side mobile composition above. Keep dark
readable text on the light boards and tiles, 24px minimum matrix targets, complete
titles/descriptions, and accessible focus. Verify 1440x900, 1280x720, 1024x700,
1440x800, 390x844, 390x740, 360x640 and 844x390. Landing pixels, actions and footer
content stay unchanged. Every other route shares its palette; active games hide
the footer and restore it on results.
