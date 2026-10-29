---
name: Mathrix
description: "The landing’s light identity extended to matrix tactics."
colors:
  bg: "#fff"
  panel: "#f5f7f9"
  line: "#dbe1e5"
  text: "#0b1921"
  muted: "#65727a"
  cyan: "#006daf"
  blue: "#245ad3"
  orange: "#a33e1c"
  pink: "#a53b68"
  green: "#19583c"
  red: "#8b293a"
  gold: "#79590d"
  cyan-hover: "#00598f"
  button-hover: "#e8f0f6"
  self-board: "#e6f3eb"
  opponent-board: "#fbe9ed"
  self-cell: "#f5fcf7"
  opponent-cell: "#fff7f8"
  self-line: "#b9d8c5"
  opponent-line: "#e5bec6"
  self-tile: "#c8e5d3"
  opponent-tile: "#f5c7cf"
  tile-ink: "#152b22"
  tile-line: "#9bac9f"
  selection: "#cde8fa"
typography:
  display:
    fontFamily: '"Poppins", system-ui, sans-serif'
    fontSize: "clamp(34px, 5vw, 60px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  headline:
    fontFamily: '"Poppins", system-ui, sans-serif'
    fontSize: "25px"
    fontWeight: 700
    letterSpacing: "-0.7px"
  title:
    fontFamily: '"Poppins", system-ui, sans-serif'
    fontSize: "20px"
    fontWeight: 700
  body:
    fontFamily: '"Poppins", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: '"Poppins", system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 400
  caption:
    fontFamily: '"Poppins", system-ui, sans-serif'
    fontSize: "11px"
    letterSpacing: "0.04em"
  control:
    fontFamily: '"Poppins", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 400
  primary-control:
    fontFamily: '"Poppins", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 700
  landing-action:
    fontFamily: '"Poppins", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 500
rounded:
  cell: "5px"
  field: "6px"
  control: "8px"
  tile-inset: "9px"
  board: "10px"
  card: "12px"
  tile: "13px"
  profile: "16px"
  avatar: "50%"
spacing:
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
  "30": "30px"
  "48": "48px"
  "60": "60px"
components:
  button-primary:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.bg}"
    typography: "{typography.primary-control}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.cyan-hover}"
    textColor: "{colors.bg}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.button-hover}"
    textColor: "{colors.text}"
  button-text:
    textColor: "{colors.cyan}"
    typography: "{typography.control}"
    padding: "20px 0"
  landing-action:
    textColor: "{colors.text}"
    typography: "{typography.landing-action}"
    padding: "8px 12px"
  text-field:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.field}"
    padding: "12px"
  navigation:
    textColor: "{colors.text}"
    padding: "0 48px"
    height: "90px"
  content-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "30px"
  matrix-panel:
    backgroundColor: "{colors.self-board}"
    textColor: "{colors.green}"
    rounded: "{rounded.board}"
    padding: "4px"
  matrix-panel-opponent:
    backgroundColor: "{colors.opponent-board}"
    textColor: "{colors.red}"
  matrix-cell:
    backgroundColor: "{colors.self-cell}"
    textColor: "{colors.green}"
    rounded: "{rounded.cell}"
    padding: "0 1px"
  operation-tile:
    textColor: "{colors.tile-ink}"
    rounded: "{rounded.tile}"
    padding: "8px 10px"
  operation-tile-defense:
    backgroundColor: "{colors.self-tile}"
  operation-tile-offense:
    backgroundColor: "{colors.opponent-tile}"
  footer:
    textColor: "{colors.muted}"
    padding: "30px 48px"
---

# Design System: Mathrix

## Overview

**Creative North Star: "White ground, dark ink, blue actions and Poppins"**

The approved landing identity sets the visual world: a white ground, dark readable ink, blue actions and rounded Poppins lettering. Supporting screens, including administration, inherit that light theme. The official landing logo and its restrained composition remain intact.

Game surfaces extend that identity with pastel green and red ownership, clean inset tile frames and precise SVG geometry. Density changes with the space available; labels, signed values, legal targets and complete tile descriptions carry the interaction.

This scan records the finished CSS and components, with descriptive names inferred from their observed roles. Sources are [the stylesheet](app/style.css), [shared layout](app/layout.tsx), [navigation](app/navigation.tsx), [icons](app/icons.tsx), [play](app/play/page.tsx), and sampled authentication, settings, tutorial, profile, leaderboard and administrative routes. Approved brand constraints are in [PRODUCT.md](PRODUCT.md); exact game composition belongs to [the play surface brief](.impeccable/surfaces/app-play.md). The supplied reference metadata was checked; no new raster assets were introduced.

**Key Characteristics:**

- White surfaces with dark ink and blue actions.
- One Poppins type family, with tabular numerals for live game data.
- Green/red ownership reinforced by text, scope markers and target outlines.
- Border-led containers, native controls and authored SVG interface icons.
- One shared legal/social footer across every route.

## Colors

The palette keeps neutral surfaces quiet, actions blue and ownership pastel; the frontmatter owns the exact values.

### Primary

- **Action Blue** (`cyan`) marks primary controls, links, caret, focus, selected tiles and legal targets; **Deep Action Blue** (`cyan-hover`) is the primary hover.
- **Focus Blue** (`blue`) outlines focused avatar choices.

### Secondary

- **Player Green** (`green`) and **Opponent Red** (`red`) carry board text and state borders. Each has a pale board, near-white cell, soft line and stronger pastel tile companion (`self-*` / `opponent-*`).
- **Warning Rust** (`orange`) marks urgent clocks, negative cells and form errors. **Alert Rose** (`pink`) marks analytics alerts.
- **Cosmetic Gold** (`gold`) remains scoped to Premium identity and gold protection tiers.

### Neutral

- **White Ground** (`bg`), **Cool Panel** (`panel`) and **Soft Divider** (`line`) define pages, content containers and fields.
- **Dark Ink** (`text`) carries primary text; **Slate Text** (`muted`) carries prose and supporting labels.
- **Cool Hover** (`button-hover`) is the standard control hover. **Tile Ink** (`tile-ink`) and **Tile Edge** (`tile-line`) define operation cards.
- **Selection Blue** (`selection`) themes browser text selection. Sidecar tonal ramps are synthesized previews, not additional shipping colors.

**The Shared Light Rule.** Use the landing’s white ground, dark ink and blue actions on every route, including administration.

## Typography

**Display Font:** Poppins (system-ui, sans-serif fallback).  
**Body Font:** Poppins (the same fallback).

Rounded letterforms keep headings, explanations and controls in one voice. Headings use weight and compact tracking; live numeric data uses tabular figures.

### Hierarchy

- **Display:** the frontmatter display role is the shared page heading. The profile title has its observed larger responsive range (`clamp(40px, 5.5vw, 68px)`).
- **Headline / Title:** second- and third-level headings use the corresponding frontmatter roles.
- **Body:** the body role describes prose paragraphs. Form controls use the control role rather than the paragraph line-height.
- **Label / Caption:** labels identify fields; captions carry secondary information. Uppercase gameplay ownership, stage and tier labels are semantic information.
- **Game:** regular tile titles are bold (18px, line-height 1.1); compact titles are 12px, or 14px on widths of at least 700px. Summaries change from 12px / 1.3 to 10.5px / 1.2 in compact play, restoring 12px on wider screens. Cell values use a viewport-height clamp and container-relative sizing for long numbers.

**The One Typeface Rule.** Poppins carries headings, controls, navigation and game data; preserve the official landing logo as an asset.

## Layout

The shared shell is a vertical flex layout with a growing main area and a non-shrinking footer. Navigation and footer cap at 1280px. Standard content caps at 1100px, narrow forms at 500px; profile and admin content use wider observed caps (1200px and 1240px). Desktop pages use generous vertical padding; at 700px and below, pages and shell reduce their gutters. Action groups and admin tabs wrap; tables scroll horizontally.

The spacing entries record recurring CSS steps rather than an enforced uniform scale. Controls group with small gaps, while sections and page edges receive more space. The landing remains a separate centered logo-and-actions composition with its navigation hidden.

**Play-specific layout:** [the approved surface brief](.impeccable/surfaces/app-play.md) governs the board/tray composition. Play hides the main navigation and fits above the actual shared footer in a dynamic viewport. Portrait boards stack; landscape boards sit side by side. At a viewport of at least 1024px wide and 700px high, player details move to the boards’ outer sides and the tray uses four columns and two rows. This composition is not a universal app layout.

The main area is a named size container. At 700px or less of remaining match height, the tray becomes one horizontal scrolling row beside Skip turn, and each tile puts title and summary in adjacent columns. At 380px or less, the tray becomes shorter and tiles wider. Matrix controls retain 24px minimum targets. Viewports shorter than 800px use tighter match-footer padding and gaps while preserving its links, icons, colors and type.

## Elevation & Depth

Content surfaces use pale fills and single borders rather than raised card shadows. An active board adds an inset ownership stroke; protection adds a thin ownership outline. The tile’s inset white frame provides its layered edge. These are state and material contours, not ambient elevation.

The inherited Premium avatar glow remains a scoped product cosmetic and is excluded from the reusable elevation vocabulary. Motion follows existing control transitions, score feedback and tile changes; reduced-motion preferences disable animations and transitions.

## Shapes

Inputs, controls, boards and tiles use their distinct frontmatter radii. Larger profile containers use the profile radius; player avatars are circular. Operation tiles have a separate inset frame, scope geometry outside the frame and a shortcut below it. Row arrows are horizontal, column arrows vertical, and whole-matrix scope uses a four-cell SVG.

The system also themes native surfaces: light color-scheme, blue caret and focus, pale blue selection, thin palette-colored tile-tray scrollbars, and offset underlines for landing and legal links.

## Components

### Buttons

Primary buttons use Action Blue, white text and bold weight. Secondary buttons use Cool Panel, Dark Ink and a Soft Divider border. Both share the control radius and padding. Hover follows the frontmatter variants; focus is a blue 3px outline offset by 3px. Disabled buttons fade to 0.4 opacity and use a not-allowed cursor. Loading retains the control and changes its action text.

Text buttons are blue and unframed. Landing actions are a separate square, transparent treatment with a 44px minimum height and underline-on-hover. Do not apply that landing-only treatment to every action.

### Cards / Containers

Tutorial containers use the card radius, Cool Panel fill, single divider border and roomy padding. Account and administrative panels reuse the same palette with content-specific sizes. Tables, labels and lists carry their own content; containers do not supply decorative headings.

### Inputs / Fields

Native input, select, textarea and checkbox controls carry the light theme. Text fields use White Ground, Dark Ink, a single divider border, the field radius and a blue caret. Labels sit above fields. Focus uses the shared blue outline; checkboxes use Action Blue as their native accent. Existing errors use text plus a recovery message, and unavailable actions use native disabled controls.

### Navigation

The wordmark uses dark ink and blue lettering with an authored matrix SVG. Links are plain Poppins text and turn blue on hover. At 700px and below, the brand and link type shrink and secondary links hide. Registered accounts use native details/summary with a bordered white menu; Escape closes it and returns focus. The main navigation is hidden only for the landing and active game compositions.

### Matrix Panels and Operation Tiles

Board fills, cell fills and text inherit the player’s green or red role. Active turns strengthen the board boundary; negative values use Warning Rust, protected cells retain an outline and shield countdown, and long values resize within their own cells.

Tiles use green for defensive, red for offensive and a sharp diagonal red/green split for either matrix or labeled shared targets. Title, concise summary, ownership, tier when present, scope marker, help and shortcut remain distinct. Unavailable tiles keep their color and text with a dashed border rather than fading. Native help dialogs retain full rules; match clocks continue while help is open. Locked slots use dashed outlines and an explicit unlock instruction.

**The Target Rule.** A selected tile uses a blue outline; legal targets use blue outlines, with a pale blue tint on cells and axes.

### Shared Footer

The shared footer contains Privacy Policy and Terms of Service plus email, Reddit and Discord links with inline SVG icons and accessible names. Legal links and social icons use Slate Text and turn Action Blue on hover. On small screens the groups stack; social targets remain 42px. The short-match variant changes spacing only.

## Do's and Don'ts

### Do:

- **Do** preserve the landing logo, composition and behavior.
- **Do** retain Privacy Policy, Terms of Service, email, Reddit and Discord in the shared footer, including during matches and practice.
- **Do** pair ownership colors with labels and SVG scope markers; retain full tile titles, summaries and help.
- **Do** keep keyboard focus visible, native form semantics and matrix targets at least 24px.
- **Do** apply the play surface brief to game composition; give supporting routes their own content-appropriate layout.

### Don't:

- **Don't** introduce a separate dark theme for game, account or administrative routes.
- **Don't** add decorative kickers or eyebrows above headings.
- **Don't** replace authored SVG interface icons with Unicode or emoji; mathematical notation remains content.
- **Don't** make the Premium avatar glow a generic card or surface elevation style.
- **Don't** hide the footer or crop either matrix to make the play layout fit.
