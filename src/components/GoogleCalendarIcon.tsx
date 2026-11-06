/** Google Calendar's mark (as GSheetIcon is Sheets'): where it's connected. */
export default function GoogleCalendarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flex: "none" }}>
      <path fill="#fff" d="M37 11H11v26h26z" />
      <path fill="#ea4335" d="M37 48l11-11H37z" />
      <path fill="#fbbc04" d="M48 11H37v26h11z" />
      <path fill="#34a853" d="M37 37H11v11h26z" />
      <path fill="#188038" d="M0 37v7a4 4 0 0 0 4 4h7V37z" />
      <path fill="#1967d2" d="M48 11V4a4 4 0 0 0-4-4h-7v11z" />
      <path fill="#4285f4" d="M37 0H4a4 4 0 0 0-4 4v33h11V11h26z" />
      <text x="24" y="31" textAnchor="middle" fontSize="15" fontWeight="700" fill="#4285f4" fontFamily="Roboto, Arial, sans-serif">31</text>
    </svg>
  );
}
