# NEXT_TASK

## Verify the current implementation

The next task is deployment/verification of the code already in the repository.

1. Deploy the current repository to the asset-backed Cloudflare Worker.
2. Confirm the deployment includes the current `public/` assets and D1 binding.
3. Verify the Fields screen, field CRUD, search, and maps.
4. Verify Plant Field GPS selection and manual existing-field selection.
5. Verify planting create/edit/delete and duplicate merge behavior.
6. Verify variety add/rename/delete behavior and usage protection.
7. Verify Activity access, login history, CSV export, and administrator-only season archive.
8. Verify the PWA/service-worker behavior on a normal browser and existing Home Screen installation.
9. Verify `/api/health` and confirm production data remains intact.

## Constraints

- Do not modify the D1 schema.
- Do not alter production field data as part of verification.
- Do not add features.
- Treat GitHub source and Cloudflare deployment as separate states.
- Do not report production deployment as complete until Cloudflare confirms it.
