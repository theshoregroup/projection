# Issue tracker: Linear (team PROJ)

Issues and specs for this repo live in **Linear**, team **PROJ**.

## CLI conventions

- **Create**: `linear issue create --team PROJ --title "…" [-d "…"]`
- **View**: `linear issue view <PROJ-NNN>`
- **Update**: `linear issue update <PROJ-NNN> [--state started] [-l <label>]`
- **Comment**: `linear issue comment add <PROJ-NNN> --body "…"`
- **List**: `linear issue mine --team PROJ [--state started]`

Issue IDs follow the pattern `PROJ-NNN`.

## Triage state

Triage state is recorded via Linear labels/states. See `triage-labels.md` for the five canonical role strings.

## When a skill says "publish to the issue tracker"

Create a Linear issue on team PROJ using the `linear` CLI. If a spec (PRD) is involved, attach it as the issue description or link to it from the issue body.

## When a skill says "fetch the relevant ticket"

Use `linear issue view <PROJ-NNN>`. The user will normally provide the issue ID or the current branch will encode it.

## Linking PRs

When creating a GitHub PR for a Linear issue, name the branch to include the issue ID (e.g. `proj-123-add-foo`) so the PR is automatically linked.