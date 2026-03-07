# FAAAAH! 🔊 — Test Failure Sound for VS Code

A playful extension that plays a loud **FAAAAH!** whenever a terminal command or task exits with a non‑zero code
(typically a failing test run). It's meant to make failures impossible to ignore and add a little levity to debugging.

> ### Version 1.1.1
> 1. fixed an issue in which the mute/unmute status was not showing properly
> 2. Removed the annoying error popup meesage. Now you can see the error message on the status bar
> 3. Added icon

## Features

- Automatically listens for:
  - Terminal processes that exit with an error code.
  - VS Code Task executions (e.g. `npm test`, `pytest`) that fail.
- Plays a bundled WAV file using the OS's default audio tool.
- Configurable volume.
- Status bar indicator/buttons for quick toggle.
- Works on macOS, Windows and Linux (requires aplay/paplay/play on Linux).

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `faaaah.enabled` | boolean | `true` | Enable or disable the sound effect. |
| `faaaah.volume` | number | `0.8` | Playback volume (0.0‑1.0). |

## Commands

| Command | Title | Description |
|---------|-------|-------------|
| `faaaah.testSound` | FAAAAH: Test the sound | Immediately play the sound (for testing). |
| `faaaah.toggle` | FAAAAH: Toggle on/off | Toggle the extension on/off (also via status bar). |

## Installation

### From Marketplace

Search “FAAAAH” in the Extensions view and install.

### From Source

```bash
git clone <repo-url>
cd faaaah-extension
npm install
npm run compile
# press F5 in VS Code to run in Extension Development Host
```

### Package

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension faaaah‑1.0.0.vsix
```

## Linux Requirements

Linux systems need one of these players to be available:

- `aplay` (ALSA) – usually preinstalled
- `paplay` (PulseAudio)
- `play` (SoX)

## Contributing

Ideas, bugs and PRs welcome! Possible enhancements:

- Custom sound files
- Victory noise on test success 🎉
- Detection heuristics for more test runners
- Support for the VSCode Test Explorer API

---

> May your tests pass… but if they don't, at least you'll know about it.
