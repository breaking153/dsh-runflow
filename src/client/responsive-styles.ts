export const RUNFLOW_RESPONSIVE_STYLES = String.raw`
.dsh-runflow-root{container-name:runflow-shell;container-type:inline-size;min-inline-size:0;overflow:hidden}
.editor-workspace{position:relative}

@container runflow-shell (max-width:1080px){
  .workflow-sidebar{width:64px;flex-basis:64px}
  .workflow-sidebar-brand{justify-content:center;padding:0}
  .workflow-sidebar-brand-copy,.workflow-sidebar-brand>button,.workflow-sidebar-library,.workflow-sidebar-nav span,.workflow-sidebar-nav em,.workflow-sidebar-create span,.workflow-sidebar-host span,.workflow-sidebar-footer>button{display:none}
  .workflow-sidebar-create{width:40px;margin:12px auto}
  .workflow-sidebar-nav{grid-template-columns:1fr;padding:8px 9px}
  .workflow-sidebar-nav button{justify-content:center;padding:0}
  .workflow-sidebar-footer{justify-content:center;padding:0 7px}
  .workflow-sidebar-host{flex:0 0 30px;justify-content:center}
  .workspace-page{padding:32px clamp(18px,4cqw,44px)}
  .table-head,.workflow-row{grid-template-columns:minmax(220px,1fr) 112px 112px 70px}
  .table-head>span:nth-child(4),.workflow-row>.muted-cell{display:none}
  .editor-tabs,.selection-help{display:none}
  .editor-title{min-width:0;flex:1}
  .editor-title input{min-width:80px;width:min(180px,24cqw)}
  .editor-actions{min-width:0;gap:5px}
  .editor-actions .icon-text-button{width:34px;padding:0;justify-content:center;font-size:0}
  .editor-actions .publish-toggle{width:34px;padding:0;justify-content:center;font-size:0}
  .editor-actions .run-action{width:36px;min-width:36px;padding:0;justify-content:center;font-size:0}
  .header-error{max-width:28px;overflow:hidden;font-size:0}
  .inspector-wrap{position:absolute;right:0;top:0;bottom:0;z-index:25;width:min(318px,calc(100% - 64px));filter:drop-shadow(-8px 0 18px rgba(25,55,120,.12))}
  .inspector-wrap.closed{width:0}
  .flow-panel.inspector{width:100%}
  .selection-toolbar{max-width:calc(100% - 20px);overflow-x:auto;scrollbar-width:thin}
}

@container runflow-shell (max-width:880px){
  .editor-header{height:56px;flex-basis:56px;gap:5px;padding:0 8px}
  .back-button{width:32px;height:32px;flex:0 0 32px}
  .editor-title input{width:min(170px,26cqw);font-size:12px}
  .editor-title>span:nth-child(2),.editor-title .workflow-status{display:none}
  .workspace-page{padding:26px 18px}
  .page-header{align-items:flex-start;margin-bottom:22px}
  .page-header h1{font-size:26px}
  .page-header div>span{font-size:12px}
  .page-filters{flex-wrap:wrap}
  .page-search{width:min(100%,420px);flex:1 1 260px}
  .execution-head,.execution-list-row{grid-template-columns:105px minmax(180px,1fr) minmax(145px,.8fr) 84px}
  .execution-head>span:last-child,.execution-list-row>span:last-child{display:none}
  .canvas-toolbar{top:9px;left:9px;right:9px}
  .selection-toolbar{top:60px}
  .node-search-browser{width:min(700px,calc(100cqw - 24px))!important;max-height:calc(100% - 24px);left:12px!important}
  .node-search-layout{grid-template-columns:148px minmax(0,1fr)}
  .node-search-preview{display:none}
}

@container runflow-shell (max-width:720px){
  .workflow-sidebar{width:52px;flex-basis:52px}
  .workflow-sidebar-brand{height:54px;flex-basis:54px}
  .workflow-sidebar-logo{width:32px;height:32px;flex-basis:32px}
  .workflow-sidebar-nav{padding:7px 6px}
  .workflow-sidebar-nav button{height:36px}
  .workflow-sidebar-footer{height:46px;flex-basis:46px}
  .workspace-page{padding:20px 12px}
  .page-header{align-items:stretch;flex-direction:column;gap:14px}
  .page-header h1{font-size:24px}
  .primary-action{align-self:flex-start}
  .page-search{width:100%;flex-basis:auto}
  .filter-select{min-width:0;flex:1 1 170px}
  .filter-select select{min-width:0;width:100%}
  .table-head,.execution-head{display:none}
  .workflow-row{grid-template-columns:minmax(0,1fr) auto;min-height:64px;padding:8px 10px}
  .workflow-row>.workflow-status,.workflow-row>.execution-chip,.workflow-row>.muted-cell{display:none}
  .execution-list-row{grid-template-columns:92px minmax(0,1fr);padding:8px 10px}
  .execution-list-row>time,.execution-list-row>span:nth-child(4),.execution-list-row>span:nth-child(5){display:none}
  .inspector-wrap{width:calc(100% - 52px)}
  .canvas-toolbar .add-node-button{width:36px;padding:0;justify-content:center;font-size:0}
  .editor-actions .icon-text-button,.editor-actions .publish-toggle{display:flex}
  .canvas-toolbar .history-tools button{width:28px}
  .canvas-tools button{width:30px}
  .selection-toolbar{left:8px;right:8px;max-width:none;transform:none}
  .selection-toolbar button span{display:none}
  .selection-toolbar strong{max-width:88px;overflow:hidden;text-overflow:ellipsis}
  .execution-dock,.queue-dock{left:8px;right:8px;width:auto}
  .node-search-layout{grid-template-columns:106px minmax(0,1fr)}
  .template-browser-create{grid-template-columns:1fr auto}
  .template-browser-create>span{display:none}
}

@container runflow-shell (max-width:560px){
  .workflow-sidebar{width:48px;flex-basis:48px}
  .editor-header{height:92px;flex-basis:92px;display:grid;grid-template-columns:32px minmax(0,1fr);grid-template-rows:46px 45px;padding:0 7px;column-gap:4px}
  .editor-title{grid-column:2;grid-row:1;min-width:0}
  .editor-title input{width:100%;max-width:none}
  .editor-actions{grid-column:1/-1;grid-row:2;width:100%;justify-content:flex-end;overflow-x:auto;padding-top:5px;border-top:1px solid var(--rf-line);scrollbar-width:none}
  .editor-actions::-webkit-scrollbar{display:none}
  .workspace-page{padding:16px 9px}
  .host-strip{padding:0 9px}
  .workflow-main{gap:8px}
  .workflow-avatar{width:32px;height:32px}
  .workflow-main strong{font-size:12px}
  .workflow-main small{font-size:9px}
  .inspector-wrap{width:calc(100% - 48px)}
  .selection-toolbar{top:52px}
  .selection-toolbar strong{max-width:72px;padding:0 5px}
  .selection-toolbar button{padding:0 6px}
  .react-flow__minimap{display:none}
  .node-search-layout{grid-template-columns:1fr}
  .node-search-layout>aside{display:none}
  .node-search-browser{height:min(520px,calc(100% - 16px));left:8px!important;width:calc(100cqw - 16px)!important}
  .template-browser-backdrop,.keybindings-backdrop{padding:8px}
}
`
