# Interview pairing task — "Today" marker on the Board

> This is not actually a product issue. This has been written for a **hiring exercise** only.

---

We currently show no relevant time information on our project board. For example, for ongoing projects, we have no indication where the current date is. This would be a helpful guide to users to quickly identify ongoing, past and future tasks.

This should be a visual guide only, and not make any actual changes to functionality.

## Goals

1. Only show a today marker when todays date falls within a projects window (start/end date)
2. Render a vertical marker spanning the full timeline at todays position
3. The marker should render below other content, but remain visible, with a distinct colour (e.g red) to distinguish it from the boards grey highlighting.
4. Make use of existing code patterns if at all possible

### Possible Stretch Goals

1. Easy unit test for the `isToday` helper if one is created
2. If a label is added to the bar, a helper should show/hide the label based on the user's use of zoom (`dayWidth`)
