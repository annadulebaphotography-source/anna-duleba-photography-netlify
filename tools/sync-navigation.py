from pathlib import Path
import re
import sys

PROJECT = Path(__file__).resolve().parents[1]
NAV_ROOT = (PROJECT / "_shared" / "nav-root.html").read_text(encoding="utf-8").strip()
NAV_PAGES = (PROJECT / "_shared" / "nav-pages.html").read_text(encoding="utf-8").strip()
NAV_PATTERN = re.compile(r'<nav class="navbar">[\s\S]*?</nav>', re.I)


def sync_file(path: Path, nav: str, dry_run: bool = False) -> bool:
    text = path.read_text(encoding="utf-8")
    new_text, count = NAV_PATTERN.subn(nav, text, count=1)
    if count != 1:
        print(f"SKIP no unique nav: {path.relative_to(PROJECT)}")
        return False
    if new_text == text:
        return False
    if not dry_run:
        path.write_text(new_text, encoding="utf-8", newline="")
    print(("WOULD UPDATE " if dry_run else "UPDATED ") + str(path.relative_to(PROJECT)))
    return True


def main() -> int:
    dry_run = "--check" in sys.argv or "--dry-run" in sys.argv
    changed = 0
    changed += sync_file(PROJECT / "index.html", NAV_ROOT, dry_run)
    for path in sorted((PROJECT / "pages").glob("*.html")):
        changed += sync_file(path, NAV_PAGES, dry_run)
    if dry_run and changed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
