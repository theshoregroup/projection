# Groups are self-referencing Lines with derived order and derived dates

The Board gained row selection with bulk Copy / Delete / Group actions, and Groups that nest. A Group is not a new table: it is a `line` row with `is_group` set, linked to its children by the self-referencing `group_id` column (null = top level, `ON DELETE CASCADE`). Display order is derived — siblings ordered by the existing sparse `sort_order`, flattened depth-first — and a Group's Start/End are derived on read (earliest descendant Start, latest descendant End).

## Considered Options

- **Separate `group` table** — rejected: ordering would have to interleave two tables into one row list, and every Line query/render path would special-case the union. Nesting would still need a self-FK, so no simplicity is gained.
- **Groups as Lines + global flat `sort_order` with contiguous children** — rejected: keeping children contiguous under their header makes every drag in/out of a Group rewrite the sort order of whole blocks, and the invariant is easy to break.
- **Groups as Lines + depth-first derived order** — accepted: `sort_order` only ever compares among siblings, so moving a row (or a whole Group subtree) is a single-row write — the children follow the parent pointer. The client renders `buildRows(lines)`; every Line is exactly one visible row, so all existing row-index math is unchanged.
- **Stored, maintained Group dates** — rejected: every child mutation would have to cascade-update ancestors.
- **Derived-on-read Group dates** — accepted: `applyDerivedGroupDates` runs in `lines.list`, `board.get`, and `share.getByToken`, so no write path maintains anything and the Timeline Window math is untouched. Empty Groups are kept and fall back to their stored dates.

## Consequences

- `packages/api/src/domain/groups.ts` holds the pure tree logic (`buildRows`, `applyDerivedGroupDates`, `normalizeSelection`, `expandWithDescendants`, `isDescendantOf`) and is shared with the web app, like the other domain modules.
- `lines.reorder` takes a `groupId` alongside the sibling neighbours and is the single write path for both position and membership; the collection's `onUpdate` strips `groupId` just like `sortOrder`. The Board's drag resolves (gap, horizontal depth hint) → `(groupId, beforeId, afterId)` via `resolveDropTarget`, which is how rows drag around in, out of, and into Groups; cycle attempts resolve to a no-op.
- New mutations `lines.group` / `deleteMany` / `duplicateMany` back the header's selection actions; selection state lives in the Project page because the actions render in its header.
- Group rows reject date/Milestone/% Complete edits server-side, never open the bar popover, and render an automatic summary bar.
- `ON DELETE CASCADE` on `group_id` makes "deleting a Group deletes its subtree" hold at any depth; `deleteMany` still expands ids explicitly so the client can invalidate precisely.
