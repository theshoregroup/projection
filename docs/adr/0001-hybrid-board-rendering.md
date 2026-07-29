# Board renders hybrid: SVG geometry, DOM overlays

The Board's geometry (axis, bars, milestone diamonds, % Complete shading) is drawn as SVG from pure layout functions (`lines + timeline window + zoom → positions`), while labels, tooltips, and menus are DOM overlays. SVG keeps the deferred PDF export write-once — react-pdf consumes an SVG subset but not arbitrary DOM, so the same layout functions will feed both renderers. DOM overlays give native text truncation, tooltips, and accessibility where geometry isn't involved.

## Considered Options

- **Pure DOM/divs** — rejected: kills the write-once PDF path; a second layout would be needed at export time.
- **Pure SVG** — rejected: text truncation, tooltips, and accessibility all become manual work for no layout benefit.
