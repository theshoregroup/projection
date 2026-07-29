Status: needs-triage

# Export a Project Board as PDF

Deliberately deferred from v1 (planning grill, 2026-07-29). A Project's Board should be exportable as a PDF from the project page.

## Pre-agreed approach

- Use `@react-pdf/renderer` in a server function.
- Do **not** re-implement layout: consume the same pure layout functions that drive the Board's SVG geometry (`lines + timeline window + zoom → positions`). react-pdf supports an SVG subset (`Svg`, `Rect`, `Text`, …), and the hybrid board (ADR 0001) exists partly to keep this write-once.
- PDF contents: project name, Timeline Window axis, one row per Line (bar or milestone diamond, % Complete shading, Item/Assignee/Note text), weekend shading.

## Open questions (when picked up)

- Fit: scale-to-width on one page, or paginate at natural zoom?
- Do Share Link viewers get PDF export too?

## Comments

- 2026-07-29: Filed as deferred during the grilling session. Approach agreed there; user constraint: "I only want to write the UI code once."
