# Mathrix

<!-- impeccable:product-schema 1 -->

## Platform

web

## Purpose

A competitive 1v1 matrix tactics game. Players use shared operation tiles to
grow their signed score, change either matrix, protect cells, and manage time.
Practice teaches the same interactions without match or turn clocks.

## Users and workflows

Players enter as guests or registered accounts, choose a game mode, select a
tile and its legal target, and review the result. Account, profile, leaderboard,
tutorial, and administrative screens support this game.

## Constraints

Both complete matrices and the shared tile tray must remain visible during play
on desktop and phones. The tray starts with four tiles and can unlock up to eight;
compact screens scroll the tray horizontally. Preserve keyboard and touch play,
help dialogs, signed scoring, timing, protection, and account behavior.

## Approved brand commitments

The existing landing page and its logo are the visual reference and must retain
their appearance and behavior. The entire app uses its light theme. Every route,
including active matches and practice, shows the same legal links and social
icons as the landing footer. Short matches may reduce footer padding and gaps.

## Source of truth

Gameplay is documented in GAME_RULES.md. Layout references are the uploaded
pc_layout.jpg, mobile_layout.jpg, and tiledesign.jpg and their descriptions in
/var/lib/mathrix/design-files. The implementation uses the existing Next.js,
React, CSS, and game engine; this visual change introduces no new dependencies.
