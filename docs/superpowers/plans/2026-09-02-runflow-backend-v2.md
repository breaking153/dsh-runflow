# RunFlow backend v2 implementation plan

1. Add repository contract tests for workflow and execution files, cloning, atomic replacement, reload, and deletion.
2. Implement file repositories under `src/backend/v2` and update runtime paths to expose workflow/execution directories only.
3. Compose the repositories into `FlowService`; remove workspace maps, double persistence, migration, and publish lifecycle.
4. Remove publish from the Host Remote and browser legacy adapter while retaining the stable frontend v2 gateway.
5. Add typed n8n-style utility nodes with behavior tests.
6. Run focused Host tests, the full suite, type checking, and production build.
