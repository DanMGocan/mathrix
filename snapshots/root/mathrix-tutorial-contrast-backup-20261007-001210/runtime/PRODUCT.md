# Mathrix

<!-- impeccable:product-schema 1 -->

## Platform

web

## Purpose

A competitive 1v1 matrix tactics game. Players use shared operation tiles to
grow their signed score, change either matrix, protect cells, and manage time.
Practice teaches the same interactions without match or turn clocks.
Tutorial provides twelve guided first-game lessons against an easy AI, followed
by three free rounds, without affecting statistics or match history.

## Users and workflows

Players enter as guests or registered accounts, choose a game mode, select a
tile and its legal target, and review the result. Account, profile, leaderboard,
tutorial, and administrative screens support this game.
Every signed-in or saved guest player sees Tutorial game above the Play modes
until they explicitly hide it. Preferences can restore it; this profile setting
persists across devices, guest recovery and guest import. Each tutorial starts
fresh and never saves game progress.

## Constraints

Both complete matrices and the shared tile tray must remain visible during play
on desktop and phones. The tray starts with four tiles and can unlock up to eight;
compact screens scroll portrait cards horizontally. Matrix cells are 24–44px.
Desktop profiles remain separate beside the matrices; phones show both matrices
side by side with avatar buttons for player details. Preserve keyboard and touch play,
help dialogs, signed scoring, timing, protection, and account behavior.

## Approved brand commitments

The existing landing page and its logo are the visual reference and must retain
their appearance and behavior. The entire app uses its light theme. Every route,
shows the same legal links and social icons as the landing footer outside active
games. Active matches, Practice and Tutorial hide the footer, restoring it on results.
Portrait cards use matte texture and green/red gradients; mixed cards retain an
exact 50/50 split. Desktop trays fit as many columns as their width permits.
Mobile keyboard hints default to hidden and can be enabled in Preferences;
keyboard shortcuts remain active, including Q to skip your turn.

## Source of truth

Gameplay is documented in GAME_RULES.md. Layout references are the uploaded
pc_layout.jpg, mobile_layout.jpg, and tiledesign.jpg and their descriptions in
/var/lib/mathrix/design-files. The implementation uses the existing Next.js,
React, CSS, and game engine; this visual change introduces no new dependencies.
