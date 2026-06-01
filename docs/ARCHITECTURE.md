# Architecture

This project is now a modular browser game prototype. The current goal is still Web first: keep the experience easy to run, easy to inspect, and easy for Codex or Claude to modify safely.

## Entry Points

- `index.html` is the browser entry point.
- `src/styles/main.css` contains all interface and art-panel styling.
- `src/main.js` imports the modules, boots the simulation, and owns the frame loop.

The original `Rolls Royce Phantom v2B.html` file is kept as a legacy reference while the modular version stabilizes.

## Module Map

- `src/data/vehicle-spec.js` contains portable Phantom specification and tuning values.
- `src/data/destinations.js` contains portable destination and route metadata.
- `src/app/context.js` creates the shared app context, global state, DOM lookup table, and small utility functions.
- `src/audio/audio-engine.js` contains the Web Audio engine, synthesized V12, cabin sounds, uploaded music playback, and optional real engine recording playback.
- `src/vehicle/physics.js` contains the drivetrain, transmission, road geometry inputs, driving physics, lane logic, adaptive cruise, and chauffeur controls.
- `src/render/city.js` renders the first-person driving scene on the main canvas.
- `src/render/map.js` renders the navigation map canvas.
- `src/render/art.js` injects the static SVG cabin art.
- `src/ui/controls.js` is the UI entry module. It imports the event layer and should stay tiny.
- `src/ui/events.js` binds DOM buttons, keyboard controls, touch controls, media upload inputs, horn events, and the start overlay.
- `src/ui/vehicle-actions.js` owns vehicle-facing UI actions: doors, gears, belts, view switching, destinations, chauffeur, ride mode, cruise, windows, and reset behavior.
- `src/ui/cabin-features.js` owns cabin-facing feature effects: seat heat, ventilation, massage, Bespoke Audio toggles, Starlight, screens, privacy glass, cooler, picnic tables, Gallery, and recline controls.
- `src/ui/voice-commands.js` owns Whispers command parsing and delegates actual work to vehicle or cabin action modules.
- `src/ui/hud.js` owns per-frame DOM synchronization: HUD values, readouts, active button states, CSS custom properties, and map refresh triggering.
- `src/ui/media-status.js` owns the small "now playing" and engine sound status labels used by both cabin features and media upload events.

## Design Rules

- Keep simulation logic independent from DOM details whenever practical.
- Put browser-only systems in browser modules: DOM UI, CSS, Canvas rendering, and Web Audio.
- Put portable game rules in vehicle/data modules: physics constants, state, route data, chauffeur logic, and command parsing.
- Keep `src/ui/events.js` focused on event binding. If an event needs behavior, call a named action in another module rather than implementing the behavior inline.
- Keep `src/ui/hud.js` focused on reflecting state. It should not decide gameplay behavior.
- Keep `src/ui/voice-commands.js` as a parser/dispatcher. It should not duplicate the implementation of vehicle or cabin actions.
- Prefer small targeted edits over broad rewrites.
- When adding a feature, update the relevant documentation if it changes the architecture or player-facing workflow.

## Why This Shape

The modular Web version is not the final engine target. It is a playable design prototype and logic reference for a future Godot build. That means Web-specific rendering code can be replaced later, while vehicle behavior, route data, interaction rules, and feature definitions remain useful.
