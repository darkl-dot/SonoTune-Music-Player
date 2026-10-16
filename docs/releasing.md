# Preparing a Windows release

## Build and verify

Update the version consistently in `package.json`, `src-tauri/Cargo.toml`,
`src-tauri/tauri.conf.json`, and the version labels in the interface. Update Cargo.lock
through Cargo. Run the checks described in [VERIFICATION.md](../VERIFICATION.md).

For a standalone executable with the production frontend embedded:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo build --manifest-path src-tauri/Cargo.toml --release --features custom-protocol --bin sonotune
```

Do not change frontend assets while the native release build is running. Otherwise,
the executable and the current frontend output may refer to different versions.

## Assemble the portable directory

Create `releases/SonoTune-Windows/` containing:

- `SonoTune.exe`, from the release output directory.
- Runtime DLLs required by the chosen Windows toolchain and WebView integration.
- `demo/`, copied from `public/demo/`.
- `licenses/` and `THIRD_PARTY_NOTICES.json` for bundled third-party components.

The supplied LLVM-MinGW build includes `libunwind.dll` and `WebView2Loader.dll`.
Do not assume that an executable built with another toolchain has the same DLL needs.

## Package

Commit the intended source tree first. Then, with Python 3.11 or newer:

```sh
python scripts/package-release.py
```

The script copies the English release documentation, writes a quick-start note,
packages the portable directory and committed Git source files, checks ZIP CRCs and executable
equality, and creates `build-info.json` and `SHA256SUMS.txt`. It does not build or
download native dependencies. Build outputs, local data, and dependency directories
are excluded from the source ZIP.

Tag that commit and attach these four files to
the GitHub release:

- `SonoTune-Windows.zip`
- `SonoTune-source.zip`
- `build-info.json`
- `SHA256SUMS.txt`

Verify that the release points to the intended commit and that uploaded asset digests
match the local files. Keep repository visibility unchanged unless explicitly requested.
