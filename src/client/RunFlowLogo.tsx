export function RunFlowMark({ size = 18 }: { size?: number }) {
  return <svg
    aria-hidden="true"
    focusable="false"
    width={size}
    height={size}
    viewBox="0 0 64 64"
  >
    <path d="M14 32h10m17 0h3c4.4 0 8-3.6 8-8v-3m-11 11h3c4.4 0 8 3.6 8 8v3" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    <circle cx="14" cy="32" r="5" fill="currentColor" />
    <circle cx="52" cy="18" r="5" fill="currentColor" opacity=".72" />
    <circle cx="52" cy="46" r="5" fill="currentColor" opacity=".9" />
    <circle cx="32" cy="32" r="13" fill="currentColor" opacity=".16" />
    <circle cx="32" cy="32" r="12" fill="none" stroke="currentColor" strokeWidth="3" />
    <path d="M29 25.8 39.5 32 29 38.2V25.8Z" fill="currentColor" />
  </svg>
}
