## Context

The starting point is the verified full-stack branch. Its scheduler rejects cycles, keeps a completed-node set and passes empty vars. DSH already owns model calls, scoped tools, plugin lifetimes and its HTTP server. These boundaries should remain authoritative.

## Decisions

1. Use a native JSON-serializable state graph, inspired by [LangGraph Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api) and [Pregel runtime](https://docs.langchain.com/oss/javascript/langgraph/pregel). Importing the complete LangGraph stack would duplicate DSH Agent/model authority and require translating current plugin nodes. Merely adding palette nodes would leave the DAG scheduler unable to loop or resume.
2. `WorkflowDefinition.execution` selects `dag` or `state-graph`; absent means legacy DAG. State graphs define entry node IDs, a maximum step count, initial state and replace/append/sum/merge reducers. Each step reads one state snapshot; completed writes merge deterministically at a barrier. Conflicting replace writes fail explicitly.
3. Node control envelopes carry outputs, state updates, declared output routes, halt and interrupt. Edges remain the visible authority for routing. Parallel joins wait for their incoming messages; mutually exclusive branches use any-input convergence. A stalled all-input join fails rather than claiming success.
4. Checkpoints record pending messages, joins, state, visits and node results. The Host stores a frozen workflow and owner with its latest committed execution. Resume uses that frozen version, verifies ownership and serializes admission. Explicit interrupt nodes are supported; arbitrary instruction-pointer recovery, historical time travel and exactly-once side effects are not claimed. See [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) and [interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts).
5. Trigger ingress selects a matching entry node and supplies business input. Webhook binding is created by an authorized live Agent and stores that live identity in memory. Restart requires re-enabling a binding. The server checks bearer authentication, JSON type and body size, and returns an execution receipt. Request bodies cannot choose the workflow definition, owner, output directory or permissions. Tokens are returned once and never written into workflow definitions, logs or skills.
6. Optional `webServer` injection registers the route on the existing Host. Missing service disables webhook capability. Existing DSH verified-delivery adapters can call the trusted FlowService entry; no second listening server or persistent queue is introduced.
7. Runtime tools/skills are plugin-owned contributions. Authoring remains preset-scoped. Every invocation rechecks live service and Agent availability; unload unregisters tools, skills and HTTP routes and aborts in-flight execution. Deleting package/skill files on every disable would interfere with user content and re-enablement, so it is rejected.
8. The editor retains the established DSH design. Settings expose execution mode, entry points, limits and state; new controls use stable named ports. Execution evidence reports steps rather than estimating completion from a graph's node count. Webhook credentials remain ephemeral component state.

## Validation and Delivery

Use deterministic local providers for scheduler and state tests; simulated Agent/registry/HTTP objects for lifecycle and ingress tests. Verify checkpoint persistence and resume after constructing a new service, conflicting resume calls, wrong owners and failed writes. Run complete type checks, test suite, builds, privacy rules and OpenSpec validation. Inspect the preview at desktop and narrow widths with mock data. Push the isolated branch after review; do not execute real Agent or external workflows to demonstrate behavior.

## Limits

Single Host process and local files are the persistence boundary. This change does not implement LangGraph API compatibility, dynamic Send/map-reduce tasks, a cross-process scheduler, distributed locks, durable webhook queues, retry/dedup delivery or production load guarantees. Existing provider permissions and trusted-code assumptions remain in force.
