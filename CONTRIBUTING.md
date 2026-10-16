# Working on SonoTune

SonoTune is currently a personal project in active development. Its priorities are simple:
make local music easy to reach, keep the interface pleasant, and avoid unnecessary resource use.

## Setup

Follow the prerequisites and development commands in the [README](README.md#development).
Use the committed pnpm and Cargo lockfiles. Keep tools, build outputs, local libraries,
and application data outside Git.

## Changes

- Keep components focused and reuse the existing UI controls and theme variables.
- Add both English and Russian translations for new interface text.
- Keep filesystem work and decoding outside the UI thread.
- Preserve virtualized rendering when working on long lists.
- Respect reduced motion, keyboard interaction, and visible focus.
- Avoid adding large dependencies for small features.
- For audio or metadata changes, use synthetic fixtures rather than copyrighted recordings.

Run the checks relevant to your change:

```sh
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

The real Windows media-session test is opt-in; see [VERIFICATION.md](VERIFICATION.md).
Report what you actually tested, including any native-window or device behavior you
could not verify.

## Bug reports

Include the app version, Windows version, steps to reproduce, expected result, and
actual result. For playback issues, note the container/codec and whether seeking is
involved. A minimal synthetic or freely shareable sample is useful.

## Licensing

SonoTune is licensed under the [MIT License](LICENSE). Contributions to the application
are provided under the same license. Dependency and font licenses remain applicable;
include the appropriate notices when adding third-party assets or code.
