Status: ready-for-human

# Export a Project Board as PDF

Deliberately deferred from v1 (planning grill, 2026-07-29). A Project's Board should be exportable as a PDF from the project page.

## What was built (2026-08-24)

- Transport is **tRPC**, not a server function: `projects.exportPdf` (Owner + Editor, via `loadProjectForUser`) and `share.exportPdfByToken` (public, gated). Both return `{ filename, data: Uint8Array }` (SuperJSON); the client blobs it into a download.
- The renderer (`packages/api/src/pdf/board-pdf.tsx`, `@react-pdf/renderer`) consumes the **same pure layout functions** as the Board's SVG renderer — `deriveWindow`, `buildRows`, `ticksFor`, `weekendSpans`, `barForLine`, `rowY`, `assigneeColor`, `diamondPath`, `groupCapPaths`. To make that true, `geometry.ts` + `colors.ts` moved from `apps/web/src/lib/board-layout/` to `packages/api/src/domain/` (ADR 0001's write-once intent). No layout is re-implemented.
- PDF contents: project name/description header, Timeline Window axis, one row per Line (bar or milestone diamond, % Complete shading, Item/Assignee/**Start/End date columns**/Note text), weekend shading, page footer. The date columns also show in the main UI: the Board's side panel now carries Start/End columns (`DATE_COL_WIDTH` in `domain/geometry.ts`, shared by both renderers; Groups show their derived span). Panel default/min widths grew to fit them.
- **Fit**: scale-to-width on one page. Effective `dayWidth = clamp(availableWidth / totalDays, 1.5, 28)`; tick granularity follows automatically via `tickUnitFor` (short windows show day columns, longer ones weeks/months — the Board's own rule).
- **Page size**: A3 landscape default, with A2, A1, A0 selectable (all landscape). Vertical pagination chunks rows per page; the axis header repeats on each page. Horizontal pagination remains deferred.
- **Share Link viewers** get PDF export only when the Owner has enabled it. New `project.allow_visitors_to_export` boolean (default `false`), toggled by an Owner-only Switch in the Share dialog; it flows through `projects.update` (server-side `assertOwner` guards the flag; Editors keep rename/reseed rights). The dialog itself always shows the Download PDF button to the Owner and Editors.

## Also fixed

- The Share dialog didn't open: `ShareButton` was a zero-prop component, so base-ui's `DialogTrigger render={…}` injected its `onClick`/aria into a component that swallowed them. It now spreads its props onto the inner `Button`.

## Open questions (when picked up)

- ~~Fit: scale-to-width on one page, or paginate at natural zoom?~~ → scale-to-width (horizontal pagination deferred).
- ~~Do Share Link viewers get PDF export too?~~ → yes, gated by the Owner-controlled `allowVisitorsToExport` flag (default no).

## Comments

- 2026-07-29: Filed as deferred during the grilling session. Approach agreed there; user constraint: "I only want to write the UI code once."
- 2026-08-24: Implemented per the approach above. Review points for a human: (a) PDF colors are hardcoded to the light theme (`--border`, `--muted-foreground`) since PDFs print on white; (b) note text truncation is a char-count heuristic (react-pdf doesn't auto-truncate Svg text); (c) `MIN_PDF_DAY_WIDTH` 1.5pt means multi-year windows shrink hard rather than paginating horizontally.
- 2026-08-24 (follow-up): Added Start/End date columns to both the PDF and the Board's side panel. `use-board-panel`'s 50vw clamp now loses to the content minimum on narrow windows (`Math.max(PANEL_MIN_WIDTH, min(w, 50vw))`) — intentional, so the columns never truncate.
