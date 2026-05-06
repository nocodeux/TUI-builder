# TUI Builder

A text-first interface builder for the browser.

No panels. No shadows. No visual noise.  
Just structure, contrast, and control.

---

## What is this?

TUI Builder is an experimental UI construction environment that rejects conventional GUI patterns and rethinks interface design from a terminal-first perspective.

It treats the browser as a rendering layer for text-driven systems rather than a canvas for visual decoration.

---

## Core Principles

- **Text over visuals** — everything is readable, inspectable, explicit
- **Deterministic layout** — no hidden behavior, no magic positioning
- **High contrast** — designed for clarity, not aesthetics
- **Theme as system** — styling is not decoration, it's architecture
- **Minimal surface area** — fewer abstractions, more control

---

## Architecture

The interface is intentionally reduced to three functional zones:

- **Toolbox** — component primitives
- **Canvas** — structural composition
- **Inspector** — direct state manipulation

No abstraction layers beyond what is strictly necessary.

---

## Features

- Drag-based component composition
- CSS variable-driven theme engine
- Retro / terminal-style component set
- Real-time preview environment
- Responsive viewport modes

---

## Theming

Themes are not skins.  
They are full system overrides.

All visual output is controlled through CSS variables, enabling:

- Instant theme switching
- Complete visual redefinition without touching components
- Support for radically different interface modes (flat, high-contrast, dense)

---

## Why?

Modern UI tooling optimizes for visual design.

This project explores the opposite direction:

- What if interfaces were designed like systems, not layouts?
- What if readability mattered more than polish?
- What if UI behaved closer to a terminal than a canvas tool?

---

## Tech Stack

- React
- CSS (Custom Properties)
- Zero UI frameworks

---

## Status

Unstable. Experimental. Evolving.

Expect breaking changes.

---

## Roadmap

- Keyboard-first interaction model
- State serialization
- Theme editor (live system mutation)
- Plugin architecture
- ncurses-like behavior in the browser

---

## Run

```bash
npm install
npm run dev
```

---

## License
MIT