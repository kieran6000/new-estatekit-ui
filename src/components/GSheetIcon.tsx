/** Google Sheets logo mark. */
export default function GSheetIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#0f9d58" d="M29 2H11a3 3 0 0 0-3 3v38a3 3 0 0 0 3 3h26a3 3 0 0 0 3-3V13z" />
      <path fill="#0b7c46" d="M29 2v8a3 3 0 0 0 3 3h8z" />
      <g fill="#fff">
        <rect x="16" y="21" width="16" height="2.4" />
        <rect x="16" y="27" width="16" height="2.4" />
        <rect x="16" y="33" width="16" height="2.4" />
        <rect x="21.5" y="21" width="2.4" height="14.4" />
      </g>
    </svg>
  );
}
