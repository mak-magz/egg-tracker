# docs/design notes

`source/template.html` is the working source of truth for screen visuals. It was originally extracted from `Tamago Egg Farm Tracker.html` (the Claude Design bundle export) with `node extract.mjs`, and has since been **edited by hand** to match what was built and decided:

- Inventory per feature 06 (no Sellable, no pending reserve, "Owed on open orders", "Short by", "Inactive size", negative stock note, empty state, new footnote, no Pending delivery card).
- Sales have no status (feature 05): no Pending/Complete chips, column or Mark delivered; row menu is Edit, Print invoice, Void sale. The Dashboard "Pending deliveries" card is now "Owed on open orders".
- Invoice print page per feature 07 (Sales row menu, Print invoice).

**The bundle `Tamago Egg Farm Tracker.html` was not changed** (its template is one huge embedded JSON string, not safe to edit by hand). It is now older than `source/template.html`.

**Do not run `extract.mjs` as-is**: it deletes `source/` and rewrites it from the old bundle, losing these edits. Commit first, or point it at a new output folder. To make the bundle current, re-import `source/template.html` into Claude Design.

Not yet drawn in the design: the Orders screen and the mobile bottom bar with More (feature 05 describes them in its section 2.5).
