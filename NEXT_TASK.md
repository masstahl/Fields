# NEXT_TASK

## Immediate Verification

Deploy the latest GitHub changes to the asset-backed Cloudflare Worker without changing the D1 schema or production field data.

After deployment, verify:

1. Primary Fields screen no longer shows Add Field.
2. Activity contains Add Field.
3. Plant Field still requests GPS and opens on the nearest existing field.
4. Plant Field field search/select works.
5. Selecting a different existing field updates heading, latitude, and longitude automatically.
6. Planting cannot be saved without an existing field.
7. A crafted planting request with an invalid field ID is rejected.
8. Variety dropdown contains current varieties.
9. Add new variety works and the new variety appears in the dropdown.
10. Variety Management can rename a variety.
11. Used varieties cannot be deleted.
12. Unused varieties can be deleted.
13. Existing CSV export behavior is unchanged.
14. Existing planting duplicate merge behavior is unchanged.
15. GPS behavior remains unchanged.
16. Existing field lookup behavior remains unchanged.

## Constraints

- Do not modify the D1 schema.
- Do not add a variety table unless explicitly requested later.
- Do not redesign the existing application styling.
- Do not change GPS functionality.
- Do not change CSV export behavior.
- Do not add dashboards, reporting, analytics, or unrelated farm-management features.
- Do not claim production deployment until Cloudflare confirms it.
