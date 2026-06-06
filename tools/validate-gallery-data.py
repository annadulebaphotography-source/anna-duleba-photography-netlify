from pathlib import Path
import json
import sys

PROJECT = Path(__file__).resolve().parents[1]
GALLERY_DIR = PROJECT / "content" / "galleries"
VALID_LAYOUTS = {"natural", "masonry", "mosaic"}
VALID_VARIANTS = {"normal", "wide", "large", "full"}


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def validate_gallery(path):
    errors = []
    data = load(path)
    required = ["id", "title", "slug", "category", "categoryPage", "status", "layout", "seo", "settings", "images"]
    for key in required:
        if key not in data:
            errors.append(f"{path.name}: missing field {key}")

    if data.get("layout") not in VALID_LAYOUTS:
        errors.append(f"{path.name}: invalid layout {data.get('layout')}")

    seo = data.get("seo", {})
    for key in ["title", "description", "canonical"]:
        if not seo.get(key):
            errors.append(f"{path.name}: missing seo.{key}")

    seen_orders = set()
    seen_ids = set()
    for idx, image in enumerate(data.get("images", []), start=1):
        image_id = image.get("id")
        if not image_id:
            errors.append(f"{path.name}: image {idx} missing id")
        elif image_id in seen_ids:
            errors.append(f"{path.name}: duplicate image id {image_id}")
        seen_ids.add(image_id)

        order = image.get("order")
        if not isinstance(order, int):
            errors.append(f"{path.name}: image {image_id or idx} missing numeric order")
        elif order in seen_orders:
            errors.append(f"{path.name}: duplicate order {order}")
        seen_orders.add(order)

        if image.get("variant", "normal") not in VALID_VARIANTS:
            errors.append(f"{path.name}: image {image_id or idx} invalid variant {image.get('variant')}")

        file_value = image.get("file")
        if not file_value:
            errors.append(f"{path.name}: image {image_id or idx} missing file")
        elif not (PROJECT / file_value).exists():
            errors.append(f"{path.name}: missing image file {file_value}")

        if image.get("visible", True) and not image.get("alt"):
            errors.append(f"{path.name}: visible image {image_id or idx} missing alt")

    return errors


def main():
    files = sorted(path for path in GALLERY_DIR.glob("*.json") if path.name != "index.json")
    if not files:
        print("No gallery JSON files found.")
        return 1
    all_errors = []
    for path in files:
        errors = validate_gallery(path)
        if errors:
            all_errors.extend(errors)
        else:
            print(f"OK {path.relative_to(PROJECT)}")
    if all_errors:
        print("\nErrors:")
        for error in all_errors:
            print(f"- {error}")
        return 1
    print("\nAll gallery data valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
