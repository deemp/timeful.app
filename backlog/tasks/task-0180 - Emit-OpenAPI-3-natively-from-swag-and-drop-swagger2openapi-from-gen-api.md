---
id: TASK-0180
title: 'Emit OpenAPI 3 natively from swag and drop swagger2openapi from gen:api'
status: To Do
assignee: []
created_date: '2026-09-08 12:12'
labels:
  - frontend
  - server
dependencies:
  - TASK-0179
references:
  - frontend/package.json
  - server/docs/swagger.yaml
  - 'https://github.com/swaggo/swag'
priority: low
type: chore
ordinal: 186000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
frontend/package.json `gen:api` converts Swagger 2.0 to OpenAPI 3 via swagger2openapi on every generation (`swagger2openapi ../server/docs/swagger.yaml -o src/types/.swagger-v3.yaml --yaml && openapi-typescript src/types/.swagger-v3.yaml -o src/types/api.ts && rm src/types/.swagger-v3.yaml`). The conversion step is lossy and adds a workaround dependency. swag can emit OpenAPI 3 natively, so generate OpenAPI 3 output from the swag pipeline, feed it directly to openapi-typescript, and remove swagger2openapi and the intermediate file.

Depends on TASK-0179 only insofar as the swag version may move there; if the swag CLI version is unchanged, the tasks can run independently.

Constraint: route annotations must not change except where OpenAPI 3 output requires updates, and the generated api.ts types must remain equivalent or strictly better.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 gen:api produces types directly from swag-generated OpenAPI 3 output with no swagger2openapi step and no intermediate file
- [ ] #2 Generated frontend/src/types/api.ts diff is reviewed; no unintended type regressions and downstream code typechecks unchanged
- [ ] #3 swagger2openapi devDependency removed from frontend/package.json and lockfile
- [ ] #4 Required frontend checks pass: lint, fmt:check, typecheck, build, test:unit
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->
