export const ApertureMark = ({ size = 30, spin = false }) => (
  <svg className={spin ? "aperture-spin" : ""} width={size} height={size} viewBox="0 0 120 120">
    <g fill="#1F4A44" opacity="0.9">
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <path key={deg} d="M60,60 L60,14 L92,30 Z" transform={`rotate(${deg} 60 60)`} />
      ))}
    </g>
  </svg>
);

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6 };

export const IconDashboard = () => (
  <svg viewBox="0 0 20 20" {...stroke}>
    <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
    <rect x="11.5" y="2.5" width="6" height="9" rx="1" />
    <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
    <rect x="11.5" y="14.5" width="6" height="3" rx="1" />
  </svg>
);
export const IconInvoices = () => (
  <svg viewBox="0 0 20 20" {...stroke}>
    <rect x="3.5" y="2.5" width="13" height="15" rx="1.2" />
    <path d="M6.5 6.5h7M6.5 9.5h7M6.5 12.5h4" />
  </svg>
);
export const IconExpenses = () => (
  <svg viewBox="0 0 20 20" {...stroke}>
    <path d="M3 6.5c0-1.1 3.13-2 7-2s7 .9 7 2-3.13 2-7 2-7-.9-7-2Z" />
    <path d="M3 6.5V14c0 1.1 3.13 2 7 2s7-.9 7-2V6.5" />
    <path d="M17 10.25c0 1.1-3.13 2-7 2s-7-.9-7-2" />
  </svg>
);
export const IconSettings = () => (
  <svg viewBox="0 0 20 20" {...stroke}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 3v2M10 15v2M17 10h-2M5 10H3M14.9 5.1l-1.4 1.4M6.5 13.5l-1.4 1.4M14.9 14.9l-1.4-1.4M6.5 6.5 5.1 5.1" />
  </svg>
);
export const IconPlus = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M10 4v12M4 10h12" />
  </svg>
);
export const IconBack = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 4 6 10l6 6" />
  </svg>
);
export const IconTrash = () => (
  <svg viewBox="0 0 20 20" {...stroke}>
    <path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6M5.5 6l.6 9a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4l.6-9" />
  </svg>
);
export const IconPrint = () => (
  <svg viewBox="0 0 20 20" {...stroke}>
    <path d="M5.5 7V3.5h9V7" />
    <rect x="3.5" y="7" width="13" height="6.5" rx="1" />
    <path d="M5.5 12.5h9v4h-9z" />
  </svg>
);
