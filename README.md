# Starship Mechazilla Catch

2D rigid-body aerospace simulation where you pilot Starship through atmospheric reentry and perform a precision Mechazilla tower chopstick catch.

> 🚀 **Congratulations to SpaceX on the incredible Starship Flight 15 Mechazilla catch!**  
> Watch the historic catch video on [X (SpaceX)](https://x.com/SpaceX/status/2121715216597827756?a=KGkaWMmnocDvHPL2szg&s=20).

## Features

- **Realistic Physics**: 2D rigid-body dynamics, orbital centrifugal forces, atmospheric drag, and RCS / gimbal thrust control.
- **Atmospheric Reentry**: Extreme LEO entry with plasma heating visuals, heating limits, and deorbit burn mechanics.
- **Mechazilla Tower Catch**: Precision chopstick catch sequence requiring exact alignment of vertical speed, lateral speed, and angle.
- **Controls & Time Warp**: Dynamic time warp (1x, 5x, 10x, 20x), assisted autopilot options, and telemetry HUD.
- **Multilingual Support**: English & Japanese UI.

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Contributing / Collaborator Guide

Contributions are welcome! Below is an overview of the project structure, verification commands, and engineering conventions to help you get started.

### Project Architecture

- `src/game/physics.ts`: Pure deterministic 2D rigid-body physics, orbital centrifugal forces, aerodynamic drag, plasma heating, and catch evaluation (`FIXED_DT` fixed timestep).
- `src/game/autopilot.ts`: Guidance and assisted flight control logic.
- `src/game/renderer.ts`: HTML5 Canvas rendering (rocket, plume, plasma sheath, Mechazilla tower & chopsticks).
- `src/game/constants.ts` & `src/game/types.ts`: Physical constants, stage presets, assist configs, and shared TypeScript interfaces.
- `src/game/i18n.ts`: Localization dictionaries (`en` and `ja`).
- `src/components/`: React UI overlays (`TitleScreen`, `TelemetryHud`, `PauseModal`, `DebriefModal`, `LanguageSettingsModal`).

### Development & Verification Workflow

```bash
# Start local development server (port 3000)
npm run dev

# Run unit tests in src/game/physics.test.ts (Node test runner + tsx)
npm test

# Run TypeScript type checking (tsc --noEmit)
npm run lint

# Verify production bundle build
npm run build
```

### Contribution Guidelines

- **Keep Physics Pure & Tested**: Keep physics calculations in `src/game/physics.ts` pure and deterministic (decoupled from DOM/Canvas), and add or update unit tests in `src/game/physics.test.ts` whenever changing physics, stages, or scoring.
- **Maintain Bilingual Localization**: Keep both English (`en`) and Japanese (`ja`) translations in sync in `src/game/i18n.ts` whenever adding or updating UI copy.
- **Pre-submit Checks**: Ensure `npm run lint`, `npm test`, and `npm run build` all pass cleanly before submitting changes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
