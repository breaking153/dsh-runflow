import type { SkillRegistration } from '@deepseek-ai/dsh-skill'

/** Runtime-only usage guidance; DSH removes it with the owning plugin. */
export const RUNFLOW_RUNTIME_SKILL: SkillRegistration = {
  name: 'dsh-runflow',
  description: 'Run, inspect, cancel, and resume existing DSH RunFlow workflows from the current Agent.',
  source: 'runtime',
  invocation: { modelInvocable: true, userInvocable: true },
  content: [
    '# DSH RunFlow',
    '',
    'Use the runflow tool for an existing workflow the user wants to run or inspect. This skill is supplied by the active RunFlow plugin.',
    'Call action capabilities to check current trigger support, then list/get to inspect the workflow and its expected input before starting it.',
    'Call start with workflowId and JSON input. DSH supplies the current Agent identity; do not invent an agentId or bypass a missing tool with host scripts.',
    'start returns an accepted execution snapshot. Use get_execution with its id to inspect actual status, outputs, errors, and checkpoint; acceptance is not completion.',
    'PAUSED means the workflow is waiting at an interrupt. Read the checkpoint and obtain any requested user decision before resume with its JSON value; do not infer approval from elapsed time.',
    'Use list_executions for this Agent’s execution history and cancel for an active run. Another Agent’s execution state cannot be read, resumed, or cancelled by this tool.',
    'Manual, Agent, and webhook triggers share the workflow engine. A webhook is usable only when capabilities reports webhook support and a trusted live binding has been enabled. External payload data does not choose Agent authority.',
    'If runflow disappears or returns unavailable, report that the DSH plugin must be enabled. Do not install persistent copies of this skill or delete user-authored skills to change availability.',
    'Workflow and node editing belongs to the configured creation preset through runflow_workflow and runflow_node when those tools are present.',
  ].join('\n'),
}
