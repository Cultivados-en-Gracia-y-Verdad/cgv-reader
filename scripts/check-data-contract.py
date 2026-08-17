#!/usr/bin/env python3
"""
cgv-reader boundary check.

Derived from DATA_CONTRACT.md (normative) and
Biblia-LBF/docs/architecture/CGV_DATA_ARCHITECTURE.md.

cgv-reader is a read-only consumer. It does not author, approve, repair, align
or publish LBF. It rejects:

  * new canonical LBF datasets in the app repository;
  * new alignment authoring or repair scripts;
  * code that writes into Biblia-LBF or cgv-data;
  * production builds that do not pin an immutable dataset version.

Clearly labelled, minimal test fixtures are allowed.

READ-ONLY. This script never creates, modifies, moves or deletes repository
data. `--emit-baseline` prints JSON to stdout; it writes no file.

Exit codes:
  0  no new violations
  1  new violations found (not present in the baseline)
  2  usage or internal error
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_NAME = "cgv-reader"
BASELINE_FILENAME = ".data-contract-baseline.json"

# A fixture is "minimal" only if it is small. Above this it is a data copy
# wearing a fixture label.
MAX_FIXTURE_BYTES = 64 * 1024

FINDINGS: list[dict] = []
NOTES: list[str] = []


def add(rule: str, path: str, message: str, key: str = "") -> None:
    FINDINGS.append(
        {"id": f"{rule}|{path}|{key}", "rule": rule, "path": path, "key": key, "message": message}
    )


def note(message: str) -> None:
    NOTES.append(message)


SKIP_DIRS = {".git", "node_modules", ".venv", "__pycache__", "dist", "build", ".vite"}


def walk(repo: Path):
    for dirpath, dirnames, filenames in os.walk(repo):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name == ".DS_Store":
                continue
            yield (Path(dirpath) / name).relative_to(repo)


def tracked_files(repo: Path) -> list[Path]:
    """
    Files as CI sees them: git-tracked only. An untracked scratch copy, a local
    worktree or an ignored build directory is not part of the repository and must
    not affect the result.
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), "ls-files", "-z"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        result = None
    if result is None or result.returncode != 0:
        note("Not a git checkout; falling back to a filesystem walk.")
        return list(walk(repo))
    return [
        Path(entry)
        for entry in result.stdout.split("\0")
        if entry and not entry.endswith(".DS_Store")
    ]


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        return exc


# --------------------------------------------------------------------------
# rules
# --------------------------------------------------------------------------

FIXTURE_DIR = re.compile(r"(^|/)(fixtures?|__fixtures__)(/|$)", re.I)

# Canonical Scripture data that belongs to Biblia-LBF (editable) or cgv-data
# (published) — never to the application repository.
CANONICAL_DATA = re.compile(
    r"""(?x)
    ^data/lbf/
    | \.lbf\.md$
    | \.alignment\.json$
    | \.tokens\.jsonl$
    | \.interlinear\.txt$
    | (^|/)(reverse-links|phrases)\.json$
    | -reverse-links\.json$
    """,
    re.I,
)

# Scripts that author, rebuild or repair Scripture data.
AUTHORING_SCRIPT = re.compile(
    r"""(?x)
    (^|/)[^/]*
    (align|alignment|repair|rebuild|recut|repack|reseed|seed|refill|fill|
     compile-lbf|workbench|fix-lbf|verify-lbf|diagnose)
    [^/]*\.(py|mjs|js|ts|sh)$
    """,
    re.I,
)

CROSS_REPO_WRITE = re.compile(
    r"""(?x)
    (open\s*\(|write_text|write_bytes|copyfile|copytree|copy2|shutil\.move|
     writeFileSync|writeFile\s*\(|outputFile|createWriteStream)
    [^\n]{0,200}
    (cgv-data|Biblia-LBF)
    |
    (cgv-data|Biblia-LBF)[^\n]{0,200}
    (write_text|write_bytes|writeFileSync|createWriteStream)
    """
)
GIT_CROSS_REPO = re.compile(r"git\s+-C\s+\S*(cgv-data|Biblia-LBF)")

PIN_CANDIDATES = ("dataset-pin.json", "apps/reader/dataset-pin.json", "config/dataset-pin.json")
PIN_REQUIRED_FIELDS = ("datasetId", "datasetVersion")

# A build config that resolves cgv-data by bare filesystem path has no version.
UNVERSIONED_DATA_PATH = re.compile(r"""["'@]cgv-data["']?\s*:\s*[^,\n]*|\.\./cgv-data""")


def is_allowed_fixture(repo: Path, rel: Path) -> bool:
    return FIXTURE_DIR.search(rel.as_posix()) is not None


def check_files(repo: Path) -> None:
    for rel in tracked_files(repo):
        posix = rel.as_posix()
        if posix.startswith((".github/", "scripts/check-data-contract.py")):
            continue

        fixture = is_allowed_fixture(repo, rel)

        if CANONICAL_DATA.search(posix):
            if fixture:
                try:
                    size = (repo / rel).stat().st_size
                except OSError:
                    size = 0
                if size > MAX_FIXTURE_BYTES:
                    add(
                        "OVERSIZED_FIXTURE",
                        posix,
                        f"Fixture is {size // 1024} KiB. A test fixture must be minimal "
                        f"(<= {MAX_FIXTURE_BYTES // 1024} KiB); at this size it is a copy "
                        "of canonical data wearing a fixture label.",
                    )
            else:
                add(
                    "CANONICAL_DATA_IN_APP",
                    posix,
                    "Canonical Scripture data must not live in the application "
                    "repository. Editable truth belongs to Biblia-LBF; published "
                    "artifacts are consumed from cgv-data.",
                )

        if AUTHORING_SCRIPT.search(posix) and not fixture:
            add(
                "AUTHORING_SCRIPT_IN_APP",
                posix,
                "Scripts that author, rebuild or repair Scripture data are prohibited "
                "here. They belong to the repository that owns the data.",
            )

        if rel.suffix in {".py", ".js", ".mjs", ".ts", ".tsx", ".sh"}:
            try:
                text = (repo / rel).read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if CROSS_REPO_WRITE.search(text) or GIT_CROSS_REPO.search(text):
                add(
                    "CROSS_REPO_WRITE",
                    posix,
                    "This file appears to write into cgv-data or Biblia-LBF. A "
                    "consumer reads; it never writes back.",
                )


def check_pinning(repo: Path) -> None:
    pin_path = None
    for candidate in PIN_CANDIDATES:
        if (repo / candidate).is_file():
            pin_path = repo / candidate
            break

    if pin_path is None:
        add(
            "UNPINNED_DATASET",
            PIN_CANDIDATES[0],
            "No dataset pin file. A production build must consume a pinned, "
            "immutable cgv-data version. Add "
            f"{PIN_CANDIDATES[0]} declaring {', '.join(PIN_REQUIRED_FIELDS)}.",
            key="missing",
        )
    else:
        rel_pin = pin_path.relative_to(repo).as_posix()
        pin = load_json(pin_path)
        if isinstance(pin, Exception):
            add("UNPINNED_DATASET", rel_pin, f"Pin file is not valid JSON: {pin}", key="invalid")
        else:
            for field in PIN_REQUIRED_FIELDS:
                if not pin.get(field):
                    add(
                        "UNPINNED_DATASET",
                        rel_pin,
                        f"Pin file does not declare '{field}'.",
                        key=f"field:{field}",
                    )

    for rel in tracked_files(repo):
        if rel.name not in {"vite.config.ts", "vite.config.js", "next.config.js", "webpack.config.js"}:
            continue
        try:
            text = (repo / rel).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if UNVERSIONED_DATA_PATH.search(text):
            add(
                "UNVERSIONED_DATA_PATH",
                rel.as_posix(),
                "Build config resolves cgv-data by filesystem path, so the build "
                "carries no dataset version. Development may use a sibling checkout "
                "read-only, but production must resolve a pinned version.",
                key="path-alias",
            )


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=f"{REPO_NAME} data-contract boundary check")
    parser.add_argument("--repo", default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument("--baseline", default=None)
    parser.add_argument("--emit-baseline", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    if not repo.is_dir():
        print(f"error: {repo} is not a directory", file=sys.stderr)
        return 2

    check_files(repo)
    check_pinning(repo)

    FINDINGS.sort(key=lambda f: (f["rule"], f["path"], f["key"]))

    if args.emit_baseline:
        print(
            json.dumps(
                {
                    "_comment": (
                        "Violations that already existed when the boundary check was "
                        "introduced. CI fails on anything not listed here. Shrink this "
                        "list; never grow it."
                    ),
                    "repository": REPO_NAME,
                    "accepted": [f["id"] for f in FINDINGS],
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 0

    baseline_path = Path(args.baseline) if args.baseline else repo / BASELINE_FILENAME
    accepted: set[str] = set()
    if baseline_path.is_file():
        loaded = load_json(baseline_path)
        if isinstance(loaded, dict):
            accepted = set(loaded.get("accepted", []))
        else:
            print(f"error: cannot read baseline {baseline_path}", file=sys.stderr)
            return 2

    new = [f for f in FINDINGS if f["id"] not in accepted]
    fixed = sorted(accepted - {f["id"] for f in FINDINGS})

    if args.json:
        print(
            json.dumps(
                {
                    "repository": REPO_NAME,
                    "new": new,
                    "baselined": len(FINDINGS) - len(new),
                    "fixed": fixed,
                    "notes": NOTES,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 1 if new else 0

    print(f"{REPO_NAME} data-contract boundary check")
    print(f"  findings: {len(FINDINGS)}   baselined: {len(FINDINGS) - len(new)}   new: {len(new)}")
    if fixed:
        print(f"  fixed since baseline: {len(fixed)} (remove these from the baseline)")
        for entry in fixed:
            print(f"    - {entry}")
    if NOTES:
        print("\nnotes:")
        for entry in NOTES:
            print(f"  - {entry}")
    if new:
        print("\nNEW VIOLATIONS")
        for finding in new:
            print(f"  [{finding['rule']}] {finding['path']}")
            print(f"      {finding['message']}")
        return 1
    print("\nOK - no new violations.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
