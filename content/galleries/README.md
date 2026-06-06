# Gallery Content System - Phase 1

This folder is the future source of truth for gallery content.

Current scope:
- gallery metadata
- layout mode: natural / masonry / mosaic
- image order
- image variant: normal / wide / large / full
- featured flag
- alt text
- SEO fields

Important:
- Public gallery HTML is not overwritten automatically.
- Use `tools/validate-gallery-data.py` before publishing.
- Use `tools/generate-gallery-pages.py <gallery-id> --write` only after reviewing the generated output.
