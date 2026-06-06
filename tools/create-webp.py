import sys
from pathlib import Path
from PIL import Image


def main():
    if len(sys.argv) != 3:
        print("Usage: create-webp.py input output", file=sys.stderr)
        return 2

    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    target.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(source) as image:
        if image.mode in ("RGBA", "LA", "P"):
            image = image.convert("RGBA")
        else:
            image = image.convert("RGB")
        image.save(target, "WEBP", quality=84, method=6)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
