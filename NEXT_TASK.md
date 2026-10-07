# NEXT_TASK

## Immediate Verification

Deploy the latest GitHub changes to the asset-backed Cloudflare Worker without changing the D1 schema or production field data.

After deployment, verify:

1. Primary Fields screen no longer shows Add Field.
2. Activity contains Add Field.
3. Plant Field immediately requests GPS and opens on the GPS-detected existing field.
4. Plant Field shows only one Field Name control, with searchable existing-field results.
5. Typing a partial name filters existing fields; selecting a result updates heading, latitude, and longitude automatically.
6. A non-matching name shows “No matching field found” and blocks save.
7. Planting cannot be saved without an existing field.
8. A crafted planting request with an invalid field ID is rejected.
9. Variety dropdown contains current varieties.
10. Add new variety works and the new variety appears in the dropdown.
11. Variety Management can rename a variety.
12. Used varieties cannot be deleted.
13. Unused varieties can be deleted.
14. Existing CSV export behavior is unchanged.
15. Existing planting duplicate merge behavior is unchanged.
16. GPS behavior remains unchanged.
17. Existing field lookup behavior remains unchanged.

## Constraints

- Do not modify the D1 schema.
- Do not add a variety table unless explicitly requested later.
- Do not redesign the existing application styling.
- Do not change GPS functionality.
- Do not change CSV export behavior.
- Do not add dashboards, reporting, analytics, or unrelated farm-management features.
- Do not claim production deployment until Cloudflare confirms it.
