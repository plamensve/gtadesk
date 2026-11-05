# GTA Desk: Frontend architecture

## Runtime

GTA Desk is a **static no-build website** hosted on GitHub Pages. It uses native ES modules, CSS, Supabase Auth and browser-side PDF tools. The repository-root HTML files and `config.js` remain at root so existing links and GitHub Pages deployment keep working.

GitHub Pages is public storage; UI-based access control is not a security boundary. Keep Supabase RLS enabled on all business tables. Never place a service-role key in frontend code.

## Responsibilities

| Code | Responsibility |
| --- | --- |
| `index.html`, `assets/js/login.js`, `assets/css/login.css` | Sign-in and authorization UX |
| `dashboard.html`, `assets/js/dashboard.js`, `assets/css/dashboard.css` | Authenticated landing page |
| `zaraex.html`, `assets/js/zaraex.js`, `assets/css/zaraex.css` | Loads, catalogues, stay declarations, PDF tools |
| `certifications.html`, `assets/js/certifications.js`, `assets/css/certifications.css` | Certificate register, companies, print preview |
| `assets/js/navigation.js`, `assets/css/sidebar.css` | Shared sidebar and ZaraEx tab navigation |
| `assets/js/dom.js` | Shared safe HTML escaping and DOM lookups |
| `assets/js/globe.js`, `assets/js/orbits.js`, `assets/css/globe.css` | Globe rendering and orbit artwork |
| `assets/` SVG/JPG assets | Logos, icons, images |
| `zaraex/*.json` | Original municipality, city and product reference data |
| `tests/` | Navigation and asset integrity tests |

## Editing rules

1. **Keep HTML structural.** Add CSS to the page stylesheet; add behavior to its JavaScript ES module. Do not add inline `<style>`, `<script>` or `style="..."` attributes.
2. **Keep the current CSS cascade.** Existing historical style override blocks were moved verbatim to the corresponding page stylesheet, in the original order. The comments mark old override layers. Simplify them only with browser visual regression review.
3. **One router.** `assets/js/navigation.js` owns sidebar active state and ZaraEx tabs, using `?tab=loads|settings|stay|pdf`. Avoid another independent click handler or hash-based router.
4. **Relative URLs:** imports from a module in `assets/js/` must use `../../config.js` for root config. CSS `url(...)` paths resolve relative to `assets/css/`; browser `fetch("./zaraex/...")` resolves relative to the HTML document.
5. **Rendering untrusted text:** use `escapeHtml` from `assets/js/dom.js` where code interpolates user values into `innerHTML`.
6. **Security:** preserve both authentication and the `gtadesk_access` check before displaying protected modules. Enforce data authorization on the Supabase side.
7. **Printing:** `certifications.css` includes the printable A4 certificate layout. Preserve the `#print-target` behavior.

## Validation

Node.js 20.11+ is required for tests; **no npm dependencies or build step** are required.

```powershell
npm test
```

GitHub Actions runs these zero-dependency checks after pushes to `main`. They verify that assets exist, JS parses, page files have no inline styles/scripts, and important navigation behaviors still work.

For visual or operational changes, also manually test authenticated login/logout, direct links, Back/Forward, all four ZaraEx sections, certificate preview/print, PDF generation, and the globe on desktop and mobile. Static tests are not a substitute for browser + Supabase integration tests.
