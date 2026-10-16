# Development

The application uses **Tauri 2, React, TypeScript, Vite, Zustand, and Rust**. Its controls
are custom components, without a heavyweight UI component library. Playback uses Rodio
and Symphonia, with libopus for Ogg Opus. Metadata uses Lofty; persistence uses SQLite.

For Windows development, install Node.js 22 or newer, pnpm 11, a current stable Rust
toolchain, CMake, and the native tools required by
[Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows).
The supplied release was built with Rust 1.99 and LLVM-MinGW. A standard MSVC build uses
the Visual Studio C++ build tools instead; platform/toolchain dependencies may differ.

```sh
git clone https://github.com/darkl-dot/SonoTune-Music-Player.git
cd SonoTune-Music-Player
pnpm install --frozen-lockfile
pnpm desktop
```

For the browser preview, run `pnpm dev`. Browser playback depends on the browser's
codecs; it stores imported files in IndexedDB, exports tag edits as JSON, and cannot
automatically revisit a previously selected folder like the desktop app.

### Checks and production build

```sh
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm desktop:build
```

The Windows media-session integration test is opt-in because it creates a real temporary
system media session:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib native_session_round_trip -- --ignored --nocapture
```

See [verification notes](../VERIFICATION.md) for what was tested and its limits, and
[CONTRIBUTING.md](../CONTRIBUTING.md) for development guidance.
Portable packaging is described in [the release guide](releasing.md).

## Project structure

```text
src/
  app/                Window layout, settings, navigation, and state
  features/           Home, library, playlists, player, and tag editor
  shared/             UI primitives, types, translations, and environment adapters
src-tauri/src/        Audio, scanning, metadata, SQLite, and Windows media integration
tests/               Frontend tests and synthetic audio fixtures
public/              Offline fonts, app icon, and original demo recordings
docs/                Behavior specifications and repository artwork
```
