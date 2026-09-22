# PDF export renders with pdf-lib, lazily loaded

The Board PDF export previously rendered with `@react-pdf/renderer`, which
pulls in ~20 packages (a React reconciler, a custom layout engine, two copies
of pdfkit, fontkit, linebreak, …). One of them — the standalone `pdfkit` —
loads its standard fonts via Node subpath imports (`require('#standard-fonts/Helvetica')`).
Vite's SSR bundler (`noExternal: true`) cannot resolve those, so on Vercel's
serverless runtime the first font access threw `Cannot find module
'#standard-fonts/Helvetica'` as an unhandled rejection that killed the whole
function process — breaking every request, not just exports (PROJ-4).

The export never used what react-pdf is for (flexbox document layout,
rich text). All positioning already comes from the shared pure geometry
(`domain/geometry`, `pdf/layout.ts`); the JSX was a pass-through that
re-converted computed coordinates into draw commands.

The export now draws with `pdf-lib` directly (`pdf/render.ts`): zero runtime
dependencies beyond two small data packages, no native modules, no subpath
imports, standard fonts embedded from data. The whole PDF dependency surface
is one package (~310 kB) instead of ~17 MB across 21 packages.

The renderer is **lazy-loaded**: routers statically import only the page-size
vocabulary from `pdf/layout.ts` and `await import("../pdf/render")` inside the
export procedures, so pdf-lib is parsed only when someone exports. The Vite
build emits it as a separate chunk.

`pdf/layout.ts` keeps the pure layout decisions (scale-to-fit, pagination,
wrap-aware row heights) testable without a PDF engine; `wrapText` is the
single source of truth for wrapping so drawn text can never overflow the row
height it was measured with.

## Considered Options

- **Keep react-pdf, alias `pdfkit` → `@react-pdf/pdfkit`** — rejected: fixes
  the crash but keeps the fragile 21-package import graph; the next pdfkit
  bundling refactor would be another incident.
- **Render client-side with react-pdf's browser build** — rejected: relocates
  the same dependency graph into the client bundle without simplifying it.
