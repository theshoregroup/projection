# Projection

A Microsoft Project–style planning tool: users build Projects whose Boards render timelines of dated Lines. Single context for the whole repo.

## Language

### Planning

**Project**:
A named plan owned by exactly one user. Its visible date extent is the Timeline Window, derived from its Lines.
_Avoid_: plan, board (the Board is the view, not the container)

**Line**:
A single dated entry in a Project: Item (title), Start and End (date-only), optional Assignee and Note, % Complete, an optional Milestone toggle, and a manual row order.
_Avoid_: task, bar, row, card

**Milestone**:
A Line with its Milestone toggle set. It occupies a single day and renders as a diamond.
_Avoid_: checkpoint, deadline

**% Complete**:
A Line's progress as a whole number from 0 to 100, shaded along its bar on the Board.
_Avoid_: progress

**Timeline Window**:
The Project's visible date range: earliest Line Start to latest Line End, falling back to the Project's seed dates while it has no Lines. The window grows automatically and never clamps Lines.
_Avoid_: project dates, date range

**Board**:
The timeline view of a Project: one row per Line, bars spanning Start to End inside the Timeline Window, weekends shaded, bars colored by Assignee.
_Avoid_: kanban, chart

**Group**:
A Line that contains other Lines (which may themselves be Groups — Groups nest). It has the same required Item and optional Assignee as any Line, but its Start and End are automatic: the earliest contained Start to the latest contained End, derived on read. Its bar is a summary bar, never a Milestone, and carries no % Complete. Deleting a Group deletes everything inside it; a Group with nothing in it is kept and keeps its last dates. Checked rows on the Board can be grouped, copied (duplicated below), or deleted in bulk.
_Avoid_: summary task, phase, parent task

### Access

**Owner**:
The user who created a Project. Sole holder of membership, Share Link, and deletion powers.
_Avoid_: creator, admin (Admin means something else here)

**Editor**:
A user granted edit access to a Project by its Owner. Can change content (Lines, Project name and seed dates) but never membership.
_Avoid_: member, collaborator, viewer

**Pending Invite**:
An email address granted Editor access that has not yet signed in. Converts to Editor automatically on first Microsoft sign-in and is revocable until then.
_Avoid_: invitation request

**Share Link**:
A Project's single public, regeneratable token URL granting read-only Board access without sign-in.
_Avoid_: public link, view-only link

**Admin**:
A user with instance-wide user-management powers (list, ban, delete users, grant Admin). Has no special access to Project contents. Bootstrapped via the ADMIN_EMAILS environment variable.
_Avoid_: superuser, owner
