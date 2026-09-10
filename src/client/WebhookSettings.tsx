import { useEffect, useRef, useState } from 'react'
import type { RunFlowWebhookBinding } from '../remote-contract.ts'
import { getRunFlowClientContext, getRunFlowGateway, useFlowRuntime } from './runtime.ts'
import { useFlowStore } from './store.ts'
import { useRunFlowLocale } from './locale.ts'

export function WebhookSettings({ triggerNodeId }: { triggerNodeId: string }) {
  const workflowId = useFlowStore(state => state.workflowId)
  const runtime = useFlowRuntime()
  return <WebhookSessionSettings key={`${runtime.sessionId ?? ''}:${workflowId}:${triggerNodeId}`} workflowId={workflowId} triggerNodeId={triggerNodeId} sessionId={runtime.sessionId} />
}

function WebhookSessionSettings({ workflowId, triggerNodeId, sessionId }: { workflowId: string; triggerNodeId: string; sessionId: string | undefined }) {
  const { language } = useRunFlowLocale()
  const zh = language === 'zh'
  const capable = useFlowStore(state => state.capabilities.triggers?.webhook === true)
  const [binding, setBinding] = useState<RunFlowWebhookBinding | null>(null)
  const [token, setToken] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string>()
  const [reload, setReload] = useState(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const available = capable && sessionId !== undefined
  useEffect(() => {
    const gateway = getRunFlowGateway(); const context = getRunFlowClientContext()
    let active = true
    setToken(undefined); setBinding(null); setLoaded(false); setError(undefined)
    if (!available || gateway === undefined || context === undefined) return
    void gateway.webhooks.read(context, workflowId).then(value => { if (active) { setBinding(value); setLoaded(true) } }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { active = false }
  }, [workflowId, sessionId, available, reload])
  const mutate = async (action: 'enable' | 'disable'): Promise<void> => {
    const gateway = getRunFlowGateway(); const context = getRunFlowClientContext()
    if (!available || !loaded || busy || gateway === undefined || context === undefined) return
    setBusy(true); setError(undefined)
    const current = (): boolean => mounted.current && context.agentId === getRunFlowClientContext()?.agentId && useFlowStore.getState().workflowId === workflowId
    try {
      if (action === 'enable') {
        if (useFlowStore.getState().dirty) await useFlowStore.getState().save()
        if (!current()) return
        if (useFlowStore.getState().dirty) throw new Error(useFlowStore.getState().saveError ?? (zh ? '请先保存工作流。' : 'Save this workflow first.'))
        const receipt = await gateway.webhooks.enable(context, workflowId, triggerNodeId)
        if (current()) { setBinding(receipt.binding); setToken(receipt.token) }
      } else {
        await gateway.webhooks.disable(context, workflowId)
        if (current()) { setBinding(null); setToken(undefined) }
      }
    } catch (reason) { if (current()) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { if (current()) setBusy(false) }
  }
  return <section className="webhook-settings" aria-label="Webhook settings">
    <p>{zh ? '外部服务使用 POST JSON 和 Authorization: Bearer 令牌触发此入口。每个工作流在当前会话只有一个绑定。' : 'External services trigger this entry with POST JSON and an Authorization: Bearer token. This session has one binding per workflow.'}</p>
    {!available && <p className="model-catalog-note is-error">{zh ? '当前 Host 未开放 Webhook。请连接主会话并启用 Host Web 服务。' : 'Webhook is unavailable. Connect a main session with the Host web service enabled.'}</p>}
    {available && !loaded && error === undefined && <p role="status">{zh ? '正在加载绑定…' : 'Loading binding…'}</p>}
    {binding !== null && <div className="webhook-binding"><strong>{zh ? '已绑定入口' : 'Bound entry'}: {binding.triggerNodeId}</strong><label className="field"><span>{zh ? '请求地址 · 当前站点' : 'Endpoint · current site'}</span><input aria-label="Webhook endpoint" readOnly value={typeof location === 'undefined' ? binding.path : location.origin + binding.path} /></label><small>{zh ? '如 Host 使用其他地址，请替换域名并保留路径。' : 'If your Host uses another address, replace the origin and keep this path.'}</small></div>}
    {token !== undefined && <div className="webhook-token" role="status"><strong>{zh ? '令牌仅显示一次，请立即复制并妥善保管。' : 'This token is shown only once. Copy it now and keep it private.'}</strong><code>{token}</code><button type="button" onClick={() => setToken(undefined)}>{zh ? '已记录，隐藏令牌' : 'Hide token'}</button></div>}
    {error !== undefined && <p role="alert" className="field-error">{error}</p>}
    {available && !loaded && error !== undefined && <button type="button" onClick={() => setReload(value => value + 1)}>{zh ? '重新加载绑定' : 'Retry loading binding'}</button>}
    <div className="webhook-actions"><button type="button" aria-label="Enable webhook" disabled={!available || !loaded || busy} onClick={() => void mutate('enable')}>{busy ? (zh ? '处理中…' : 'Working…') : binding === null ? (zh ? '启用 Webhook' : 'Enable webhook') : (zh ? '更新绑定并更换令牌' : 'Update binding and rotate token')}</button>{binding !== null && <button type="button" aria-label="Revoke webhook" disabled={!available || busy} onClick={() => void mutate('disable')}>{zh ? '撤销 Webhook' : 'Revoke webhook'}</button>}</div>
    {binding !== null && <small>{zh ? '更新绑定会立即使旧令牌失效。撤销后外部调用停止生效。' : 'Updating the binding invalidates its previous token. Revoking stops external calls.'}</small>}
  </section>
}
