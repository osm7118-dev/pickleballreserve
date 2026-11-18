// 선 아이콘(stroke 2). 이모지 대신 쓴다.
type P = { className?: string };
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};
export const IconHome = ({ className = "h-6 w-6" }: P) => (
  <svg {...base} className={className}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
);
export const IconTicket = ({ className = "h-6 w-6" }: P) => (
  <svg {...base} className={className}><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" /><path d="M13 5v14" strokeDasharray="2 2" /></svg>
);
export const IconUser = ({ className = "h-6 w-6" }: P) => (
  <svg {...base} className={className}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);
export const IconBack = ({ className = "h-6 w-6" }: P) => (
  <svg {...base} className={className}><path d="M15 18l-6-6 6-6" /></svg>
);
export const IconPin = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} className={className}><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
export const IconClock = ({ className = "h-4 w-4" }: P) => (
  <svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconCheck = ({ className = "h-6 w-6" }: P) => (
  <svg {...base} className={className}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const IconChevron = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}><path d="M9 6l6 6-6 6" /></svg>
);
export const IconCalendar = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}><rect x="3" y="5" width="18" height="16" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
);
export const IconGrid = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
);
