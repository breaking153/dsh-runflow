export function RunFlowMark({ size = 18 }: { size?: number }) {
  return <svg
    aria-hidden="true"
    focusable="false"
    width={size}
    height={size}
    viewBox="0 0 64 64"
  >
    <path d="M13 17h7c12 0 12 15 24 15h8M13 47h7c12 0 12-15 24-15"
      fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
    <circle cx="13" cy="17" r="5" fill="currentColor" />
    <circle cx="13" cy="47" r="5" fill="currentColor" />
    <path d="m44 24 8 8-8 8" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}
