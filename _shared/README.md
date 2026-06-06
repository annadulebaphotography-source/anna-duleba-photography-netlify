# Shared Navigation

This project stays static HTML for SEO and accessibility. The navigation is still present in every page, but the source of truth lives here:

- `_shared/nav-root.html` for `index.html`
- `_shared/nav-pages.html` for files inside `pages/`

After editing one of those templates, run:

```powershell
python tools/sync-navigation.py
```

To check whether pages are already in sync without writing changes:

```powershell
python tools/sync-navigation.py --check
```
