from pathlib import Path
from datetime import datetime
import shutil
import sys

PROJECT = Path(__file__).resolve().parents[1]


def backup_gallery(gallery_id: str) -> Path:
    source = PROJECT / "content" / "galleries" / f"{gallery_id}.json"
    if not source.exists():
        raise SystemExit(f"Gallery not found: {gallery_id}")
    target_dir = PROJECT / "backups" / "galleries" / gallery_id
    target_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = target_dir / f"{stamp}-{gallery_id}.json"
    shutil.copy2(source, target)
    return target


def main():
    if len(sys.argv) != 2:
        print("Usage: python tools/backup-gallery.py <gallery-id>")
        return 1
    target = backup_gallery(sys.argv[1])
    print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
