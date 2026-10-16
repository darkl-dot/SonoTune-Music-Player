"""Package an assembled Windows portable directory and the Git source tree.

Build the executable first, then assemble SonoTune.exe, its runtime DLLs, demo/,
licenses/, and THIRD_PARTY_NOTICES.json in releases/SonoTune-Windows/.
This script does not download or build dependencies.
"""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    project = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-dir", type=Path, default=project / "releases/SonoTune-Windows")
    parser.add_argument("--output", type=Path, default=project / "releases")
    args = parser.parse_args()
    app = args.app_dir.resolve()
    output = args.output.resolve()
    version = json.loads((project / "package.json").read_text(encoding="utf-8"))["version"]
    display_version = "v" + (version.split(".")[0] if version.endswith(".0.0") else version)
    executable = app / "SonoTune.exe"
    if output.is_relative_to(app):
        raise SystemExit("The ZIP output directory must be outside the portable directory.")
    if subprocess.check_output(["git", "status", "--porcelain"], cwd=project).strip():
        raise SystemExit("Commit the intended source tree before packaging a release.")
    for required in [executable, app / "demo", app / "licenses", app / "THIRD_PARTY_NOTICES.json"]:
        if not required.exists():
            raise SystemExit(f"Missing portable component: {required.name}")
    if not list(app.glob("*.dll")):
        raise SystemExit("No runtime DLLs found in the assembled Windows folder.")
    binary = executable.read_bytes()
    html = (project / "dist/index.html").read_text(encoding="utf-8")
    for asset in re.findall(r'/assets/([^" ]+\.(?:js|css))', html):
        if asset.encode() not in binary:
            raise SystemExit(f"The executable does not contain the current frontend: {asset}")
    for font in (project / "public/fonts").glob("*.woff2"):
        if ("fonts/" + font.name).encode() not in binary:
            raise SystemExit(f"The executable does not contain the bundled font: {font.name}")
    output.mkdir(parents=True, exist_ok=True)
    for name in ["LICENSE", "README.md", "CHANGELOG.md", "VERIFICATION.md"]:
        shutil.copy2(project / name, app / name)
    (app / "QUICK_START.txt").write_text(
        f"SonoTune {display_version} - local music, press Play\n\n"
        "Extract the entire archive and run SonoTune.exe. No installer is needed.\n"
        "Keep the DLLs, demo folder, and licenses beside the executable.\n"
        "Windows x64 with Microsoft Edge WebView2 Runtime is required.\n\n"
        "Add folder: import your local MP3, FLAC, WAV, OGG, or OPUS files.\n"
        "Demo: try six original short recordings.\n"
        "Settings: language, appearance, startup page, banner, and scan interval.\n"
        "Playback is restored on pause. Press Play to continue.\n\n"
        "Local data: %APPDATA%\\app.sonotune.player\\\n"
        "See README.md and CHANGELOG.md for more details.\n",
        encoding="utf-8",
    )
    # Replace the earlier generated quick-start note with its English equivalent.
    (app / "ПРОЧТИ МЕНЯ.txt").unlink(missing_ok=True)

    windows_zip = output / "SonoTune-Windows.zip"
    with ZipFile(windows_zip, "w", ZIP_DEFLATED, compresslevel=6, strict_timestamps=False) as archive:
        for file in sorted(app.rglob("*")):
            if file.is_file():
                if not file.resolve().is_relative_to(app):
                    raise SystemExit("Portable directory contains an external symlink.")
                archive.write(file, Path("SonoTune-Windows") / file.relative_to(app))

    names = subprocess.check_output(["git", "ls-files", "-z"], cwd=project).decode("utf-8").split("\0")
    excluded = {".git", "node_modules", "dist", "releases", "target", "gen", "coverage"}
    source_zip = output / "SonoTune-source.zip"
    for name in filter(None, names):
        relative = Path(name)
        if excluded.intersection(relative.parts) or relative.suffix == ".tsbuildinfo":
            raise SystemExit(f"Build output or local data is tracked in Git: {name}")
    subprocess.run(
        ["git", "archive", "--format=zip", "--prefix=SonoTune/", "-o", str(source_zip), "HEAD"],
        cwd=project, check=True,
    )

    assets = [windows_zip, source_zip]
    files = {file.name: {"bytes": file.stat().st_size, "sha256": sha256(file)} for file in assets}
    manifest = {
        "version": version,
        "displayVersion": display_version,
        "platform": "Windows x64",
        "date": datetime.now(timezone.utc).date().isoformat(),
        "executableBytes": executable.stat().st_size,
        "executableSha256": sha256(executable),
        "sourceCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=project).decode().strip(),
        "files": files,
    }
    (output / "build-info.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (output / "SHA256SUMS.txt").write_text(
        "".join(f"{entry['sha256']}  {name}\n" for name, entry in files.items()), encoding="utf-8"
    )
    for file in assets:
        with ZipFile(file) as archive:
            if archive.testzip() is not None:
                raise SystemExit(f"Archive CRC verification failed: {file.name}")
    with ZipFile(windows_zip) as archive:
        if archive.read("SonoTune-Windows/SonoTune.exe") != executable.read_bytes():
            raise SystemExit("Packaged executable mismatch.")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
