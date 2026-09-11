import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useId, useState, type ReactNode } from 'react'
import { Cable, Unplug } from 'lucide-react'
import type { JsonObject, JsonValue, WorkflowNodeDescriptor } from '../contracts.ts'
import { configurableProperties, promotedPortId, readConfigProperty, type ConfigurableProperty } from '../node-properties.ts'
import { useRunFlowLocale } from './locale.ts'
import { useFlowStore, type FlowState } from './store.ts'
import { conflictingProperty } from './property-ports.ts'

export const PropertyContext = createContext<{ nodeId: string; descriptor: WorkflowNodeDescriptor } | undefined>(undefined)

/** Include external subflow bindings and follow visual reroutes to their real source. */
export function propertySources(state: Pick<FlowState, 'nodes' | 'edges' | 'subflows' | 'activeSubflowId' | 'rootGraphSnapshot'>, nodeId: string, portId: string): string[] {
  const allNodes = [...state.nodes, ...(state.rootGraphSnapshot?.nodes ?? [])]
  const allEdges = [...state.edges, ...(state.rootGraphSnapshot?.edges ?? [])]
  const incoming = allEdges.filter(edge => edge.target === nodeId && edge.targetHandle === portId)
  const subflow = state.subflows.find(item => item.id === state.activeSubflowId)
  for (const input of subflow?.inputs ?? []) if (input.nodeId === nodeId && input.nodePortId === portId) incoming.push(...allEdges.filter(edge => edge.target === subflow!.id && edge.targetHandle === input.id))
  const sourceNames = (sourceId: string, sourceHandle: string | null | undefined, visited = new Set<string>()): string[] => {
    if (visited.has(sourceId)) return []
    const source = allNodes.find(node => node.id === sourceId)
    if (source?.type === 'runflow-reroute') return allEdges.filter(edge => edge.target === sourceId).flatMap(edge => sourceNames(edge.source, edge.sourceHandle, new Set(visited).add(sourceId)))
    const port = source?.data.outputs.find(port => port.id === sourceHandle)
    return [(source?.data.label ?? sourceId) + (sourceHandle == null ? '' : ' · ' + (port?.label ?? sourceHandle))]
  }
  return [...new Set(incoming.flatMap(edge => sourceNames(edge.source, edge.sourceHandle)))]
}

export function PropertyField({ propertyKey, label, children, className = '' }: { propertyKey?: string | undefined; label: string; children: ReactNode; className?: string }) {
  const context = useContext(PropertyContext)
  const nodes = useFlowStore(state => state.nodes)
  const edges = useFlowStore(state => state.edges)
  const subflows = useFlowStore(state => state.subflows)
  const activeSubflowId = useFlowStore(state => state.activeSubflowId)
  const rootGraphSnapshot = useFlowStore(state => state.rootGraphSnapshot)
  const setPropertyPromoted = useFlowStore(state => state.setPropertyPromoted)
  const { t } = useRunFlowLocale()
  const id = useId()
  const controlId = id + '-control'
  const node = nodes.find(node => node.id === context?.nodeId)
  const declared = context === undefined || propertyKey === undefined ? undefined : configurableProperties(context.descriptor).find(property => property.key === propertyKey)
  const unresolved = node?.data.inputs.find(port => port.configKey === propertyKey && port.unavailable)
  const property = declared ?? (unresolved === undefined || propertyKey === undefined ? undefined : { key: propertyKey, type: unresolved.type })
  const promoted = property !== undefined && node?.data.promotedInputs?.includes(property.key) === true
  const sources = promoted && node !== undefined ? propertySources({ nodes, edges, subflows, activeSubflowId, rootGraphSnapshot }, node.id, promotedPortId(property!.key)) : []
  const conflict = property === undefined || promoted ? undefined : conflictingProperty(node?.data.promotedInputs ?? [], property.key)
  const action = promoted ? sources.length > 0 ? t('disconnectRestoreProperty') : t('restoreProperty') : t('promoteProperty')
  return <div className={'field property-field ' + className} data-property-field={property?.key}>
    <div className="property-field-heading">
      <label id={id} htmlFor={controlId}>{label}</label>
      {property !== undefined && node !== undefined && <button
        type="button" className={'property-input-action nodrag nopan' + (promoted ? ' is-promoted' : '')}
        data-property-key={property.key} aria-label={action + ' · ' + label} aria-pressed={promoted}
        disabled={conflict !== undefined}
        title={conflict === undefined ? action + ' · ' + property.type : t('propertyPromotionConflict', { property: conflict })}
        onClick={() => setPropertyPromoted(node.id, property.key, !promoted)}
      >{promoted ? <Unplug size={12} /> : <Cable size={12} />}<span>{action}</span></button>}
    </div>
    <div className="property-field-control" role="group" aria-labelledby={id}>
      {Children.map(children, child => isValidElement<{ id?: string; 'aria-label'?: string; 'aria-labelledby'?: string }>(child)
        && typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type)
        ? cloneElement(child, { id: controlId, ...(child.props['aria-label'] === undefined ? { 'aria-labelledby': id } : {}) }) : child)}
    </div>
    {promoted && <small className="property-input-hint">{sources.length > 0 && <span>{t('propertyConnectedFrom', { source: sources.join(', ') })}</span>}<span>{t('propertyFallbackHint')}</span></small>}
    {conflict !== undefined && <small className="property-input-hint">{t('propertyPromotionConflict', { property: conflict })}</small>}
  </div>
}

/** Visible choices with an explicit escape hatch for advisory Host catalogs. */
export function PropertyOptionsField({ propertyKey, label, value, options, onChange, emptyLabel, allowCustom = false }: {
  propertyKey: string
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  onChange(value: string): void
  emptyLabel?: string
  allowCustom?: boolean
}) {
  const { language } = useRunFlowLocale()
  const [editingCustom, setEditingCustom] = useState(false)
  const optionIndex = options.findIndex(option => option.value === value)
  const unknown = optionIndex === -1 && !(value === '' && emptyLabel !== undefined)
  const custom = allowCustom && (editingCustom || unknown)
  const customLabel = language === 'zh' ? '自定义' : 'Custom'
  const emptyValueLabel = language === 'zh' ? '空值' : 'Empty value'
  const savedValueLabel = value === '' ? emptyValueLabel : value
  const unavailableLabel = language === 'zh' ? '当前目录未列出' : 'Not in the current catalog'
  return <PropertyField propertyKey={propertyKey} label={label}>
    <select value={custom ? 'custom' : unknown ? 'unknown' : optionIndex === -1 ? '' : String(optionIndex)} onChange={event => {
      if (event.target.value === 'custom') { setEditingCustom(true); return }
      setEditingCustom(false)
      onChange(event.target.value === '' ? '' : options[Number(event.target.value)]!.value)
    }}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {unknown && !allowCustom && <option value="unknown" disabled>{savedValueLabel} · {unavailableLabel}</option>}
      {options.map((option, index) => <option key={option.value} value={index}>{option.label || emptyValueLabel}</option>)}
      {allowCustom && <option value="custom">{customLabel}{unknown ? ` · ${savedValueLabel}` : ''}</option>}
    </select>
    {custom && <div className="property-custom-option"><input aria-label={`${label} · ${customLabel}`} value={value} onChange={event => onChange(event.target.value)} spellCheck={false} /><small>{language === 'zh' ? '手工值会原样保存；可用性由 Host 在执行时校验。' : 'Custom values are preserved; the Host validates them when running.'}</small></div>}
  </PropertyField>
}

function writeProperty(config: JsonObject, key: string, value: JsonValue | undefined): JsonObject {
  const next = structuredClone(config)
  const parts = key.split('.')
  let parent = next
  for (const part of parts.slice(0, -1)) {
    const value = parent[part]
    parent[part] = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
    parent = parent[part] as JsonObject
  }
  const leaf = parts.at(-1)!
  if (value === undefined) delete parent[leaf]
  else parent[leaf] = value
  return next
}

function SchemaJsonInput({ property, value, onChange }: { property: ConfigurableProperty; value: JsonValue | undefined; onChange(value: JsonValue | undefined): void }) {
  const { t } = useRunFlowLocale()
  const serialized = value === undefined ? '' : JSON.stringify(value, null, 2)
  const [draft, setDraft] = useState(serialized)
  const [error, setError] = useState<string>()
  useEffect(() => { setDraft(serialized); setError(undefined) }, [serialized])
  return <><textarea aria-label={property.label} spellCheck={false} value={draft} aria-invalid={error !== undefined} onChange={event => { setDraft(event.target.value); setError(undefined) }} onBlur={() => {
    try {
      const parsed = draft.trim() === '' ? undefined : JSON.parse(draft) as JsonValue
      if (parsed !== undefined && property.schema.type === 'array' && !Array.isArray(parsed)) throw new Error(t('propertyExpectedArray'))
      if (parsed !== undefined && property.schema.type === 'object' && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) throw new Error(t('propertyExpectedObject'))
      onChange(parsed); setError(undefined)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }} />{error !== undefined && <small role="alert" className="field-error">{t('propertyInvalidJson', { error })}</small>}</>
}

/** Provider fields and built-in properties that have no specialized editor yet. */
export function AdditionalPropertyFields({ exclude }: { exclude: readonly string[] }) {
  const context = useContext(PropertyContext)
  const node = useFlowStore(state => state.nodes.find(node => node.id === context?.nodeId))
  const updateNode = useFlowStore(state => state.updateNode)
  const { t, language } = useRunFlowLocale()
  const emptyValueLabel = language === 'zh' ? '空值' : 'Empty value'
  if (context === undefined || node === undefined) return null
  return <>{configurableProperties(context.descriptor).filter(property => !exclude.includes(property.key)).map(property => {
    const configured = readConfigProperty(node.data.config, property.key)
    const value = configured === undefined ? property.schema.default : configured
    const change = (value: JsonValue | undefined): void => updateNode(node.id, { config: writeProperty(node.data.config, property.key, value) })
    const options = Array.isArray(property.schema.enum) ? property.schema.enum : undefined
    const optionIndex = options?.findIndex(option => JSON.stringify(option) === JSON.stringify(value))
    const unknownOption = options !== undefined && value !== undefined && optionIndex === -1
    return <PropertyField key={property.key} propertyKey={property.key} label={property.label}>
      {options !== undefined ? <select aria-label={property.label} value={value === undefined ? '' : String(optionIndex)} onChange={event => change(event.target.value === '' ? undefined : options[Number(event.target.value)])}><option value="">—</option>{unknownOption && <option value="-1" disabled>{value === '' ? emptyValueLabel : typeof value === 'object' ? JSON.stringify(value) : String(value)} · {language === 'zh' ? '当前目录未列出' : 'Not in the current catalog'}</option>}{options.map((option, index) => <option key={index} value={index}>{option === '' ? emptyValueLabel : typeof option === 'object' ? JSON.stringify(option) : String(option)}</option>)}</select>
        : property.type === 'boolean' ? <input aria-label={property.label} type="checkbox" checked={value === true} onChange={event => change(event.target.checked)} />
        : property.type === 'text' || property.type === 'number' ? <input aria-label={property.label} type={property.type === 'number' ? 'number' : 'text'} step={property.schema.type === 'integer' ? 1 : 'any'} value={typeof value === 'string' || typeof value === 'number' ? value : ''} onChange={event => change(property.type === 'number' ? event.target.value === '' ? undefined : Number(event.target.value) : event.target.value)} />
        : <SchemaJsonInput property={property} value={value} onChange={change} />}
    </PropertyField>
  })}{node.data.inputs.filter(port => port.unavailable && port.configKey !== undefined).map(port => <PropertyField key={port.id} propertyKey={port.configKey} label={port.label ?? port.configKey!}><small className="field-error">{t('propertyMetadataUnavailable')}</small></PropertyField>)}</>
}
