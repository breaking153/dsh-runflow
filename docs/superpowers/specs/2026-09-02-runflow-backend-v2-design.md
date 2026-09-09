# RunFlow backend v2 design

## Outcome

RunFlow v2 is a DSH-native workflow runtime whose durable state is explicit, inspectable, and owned by `~/.dsh_agent_workflow`. The frontend talks to one versioned Host contract; Agent, Node, Script, tool, and model capabilities are resolved from the live Cordis context.

## Boundaries

- `FileWorkflowRepository` is the only authority for workflow definitions. One workflow equals one `*.workflow.json` file.
- `FileExecutionRepository` is the only authority for execution history. One execution equals one `*.execution.json` file.
- `FlowService` is the application facade. It validates commands, snapshots the current Node providers at execution start, and coordinates the engine.
- `FlowNodeLibrary` and the Node/Script Cordis plugins remain the live provider registry. Their directory loaders own hot reload and disposal.
- `RunFlowRemoteService` owns Agent authorization and maps the v2 transport to the application facade.
- `FileExecutionOutput` owns run output and intermediate debug artifacts.

## Persistence

```text
~/.dsh_agent_workflow/
  data/
    workflows/*.workflow.json
    executions/*.execution.json
  output/<workflow>/<execution>/...
```

There is no `workspace.json`, publish state, or legacy migration. Writes use temporary files followed by atomic rename. Repository reads return clones so callers cannot mutate durable state accidentally.

## Execution lifecycle

1. Validate the submitted workflow against the live Node registry.
2. Persist the workflow when its editable content changed.
3. At start, the engine receives a Node provider snapshot. Hot reload affects the next run, never a run already in progress.
4. Every execution update is persisted independently and remains queryable after Host restart.
5. Cancellation is kept in memory because an `AbortController` is process-local; completed state remains durable.

## Default node policy

The built-in catalog follows n8n-like operational categories without copying its UI: triggers, flow control, data transforms, network actions, DSH Agent, code, and storage. Nodes expose concrete typed ports and named multi-output envelopes.

Initial v2 additions: Switch, Sort, Aggregate, JSON Parse/Stringify, Wait, and Stop & Error. Schedule/Webhook remain visibly unavailable until a real Host listener provider is installed.

## Compatibility

This is a development-stage v2 break. No migration layer is provided. The frontend gateway shape remains stable; the old `publish` operation is removed end-to-end.
