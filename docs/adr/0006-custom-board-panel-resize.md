# Board side panel uses custom pointer-based resizing

The Board's left side panel (row labels) is resizable as a whole, has a resizable `Item`/`Assignee` column split, can be dragged closed to a thin reopen rail, and can be toggled inline on mobile. We chose a small custom pointer-drag layer over the existing `react-resizable-panels` wrapper in `@projection/ui`.

## Considered Options

- **Use `react-resizable-panels` via `packages/ui/src/components/resizable.tsx`** — rejected: it sizes panels as percentages of a `PanelGroup`. Converting pixel minima/maxima (e.g. 180px minimum, 50vw cap), a snap-to-closed threshold, and a visible reopen rail into percentages that stay correct across sidebar collapse and window resize adds more complexity than a custom layer.
- **Custom pointer drag layer** — accepted: gives direct control over pixel widths, collapse snap thresholds, `localStorage` persistence, and the collapsed rail. The amount of code is small and the interaction matches the requested spreadsheet-like behavior.

## Consequences

- `useBoardPanel` owns widths, open/closed state, and persistence.
- `BoardSidePanel` renders the panel container, the right-edge resize handle, the collapsed reopen rail, and an absolute handle for the `Item`/`Assignee` boundary.
- `BoardView` keeps the panel as the first column of the same 2-column grid on both desktop and mobile, so scrolling and row alignment stay in sync.
- On mobile, the ZoomBar gets a `SidebarSimple` icon button that toggles the panel inline (fixed `180px` width) so the board and timeline remain one scrollable unit.
- We keep the visual handle styling consistent with the rest of the UI but do not depend on `react-resizable-panels` for this feature.
