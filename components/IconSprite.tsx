// SVG sprite — all 17 NanaSays icons
// Usage: <svg width="20" height="20" style={{color:'var(--teal)'}}><use href="#ic-school"/></svg>
export default function IconSprite() {
  return (
    <div
      style={{ display: 'none' }}
      dangerouslySetInnerHTML={{
        __html: `
<svg width="0" height="0" style="position:absolute;pointer-events:none;overflow:hidden;">
<defs>
  <symbol id="ic-school" viewBox="0 0 32 32" fill="none">
    <path d="M4 28 L4 14 L16 5 L28 14 L28 28" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="11" y="18" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.8" fill="none"/>
    <rect x="14" y="21" width="4" height="7" fill="currentColor" rx="1"/>
    <path d="M1 14 L16 4 L31 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="14" y1="18" x2="14" y2="28" stroke="currentColor" stroke-width="1.4"/>
    <line x1="18" y1="18" x2="18" y2="28" stroke="currentColor" stroke-width="1.4"/>
  </symbol>
  <symbol id="ic-thai" viewBox="0 0 32 32" fill="none">
    <rect x="4" y="9" width="24" height="14" rx="2" fill="white" stroke="currentColor" stroke-width="1.5"/>
    <rect x="4" y="9" width="24" height="3.5" fill="#CC0001"/>
    <rect x="4" y="19.5" width="24" height="3.5" fill="#CC0001"/>
    <rect x="4" y="12.5" width="24" height="7" fill="#2D3C8E"/>
    <line x1="4" y1="7" x2="4" y2="25" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </symbol>
  <symbol id="ic-nocommission" viewBox="0 0 32 32" fill="none">
    <rect x="7" y="15" width="14" height="12" rx="2.5" stroke="currentColor" stroke-width="1.8"/>
    <path d="M9 15 L9 11.5 C9 8.5 11 7 14 7 C17 7 19 8.5 19 11.5 L19 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <circle cx="14" cy="21" r="1.5" fill="currentColor"/>
    <text x="20" y="14" font-family="sans-serif" font-size="9" font-weight="700" fill="currentColor">£</text>
    <line x1="19" y1="7" x2="27" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </symbol>
  <symbol id="ic-award" viewBox="0 0 32 32" fill="none">
    <polygon points="16,3 19.5,12.5 30,12.5 21.5,18.5 24.5,28 16,22 7.5,28 10.5,18.5 2,12.5 12.5,12.5" fill="currentColor"/>
  </symbol>
  <symbol id="ic-globe" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="13" stroke="currentColor" stroke-width="1.8"/>
    <ellipse cx="16" cy="16" rx="5" ry="13" stroke="currentColor" stroke-width="1.4" fill="none"/>
    <line x1="3" y1="16" x2="29" y2="16" stroke="currentColor" stroke-width="1.4"/>
    <path d="M6 10 Q16 8 26 10" stroke="currentColor" stroke-width="1.1" fill="none"/>
    <path d="M6 22 Q16 24 26 22" stroke="currentColor" stroke-width="1.1" fill="none"/>
  </symbol>
  <symbol id="ic-search" viewBox="0 0 32 32" fill="none">
    <circle cx="13.5" cy="13.5" r="8" stroke="currentColor" stroke-width="2"/>
    <line x1="19.5" y1="19.5" x2="28" y2="28" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  </symbol>
  <symbol id="ic-compare" viewBox="0 0 32 32" fill="none">
    <line x1="16" y1="5" x2="16" y2="27" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="5" y1="11" x2="27" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="16" cy="5" r="2" fill="currentColor"/>
    <path d="M5 11 C4 15 3.5 17 5 18.5 L10 18.5 C11.5 17 11 15 10 11" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M22 11 C21 16 20.5 19 22 20.5 L27 20.5 C28.5 19 28 16 27 11" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="12" y1="27" x2="20" y2="27" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </symbol>
  <symbol id="ic-grad" viewBox="0 0 32 32" fill="none">
    <polygon points="16,5 30,12 16,19 2,12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>
    <rect x="12.5" y="4" width="7" height="4" rx="1" fill="currentColor"/>
    <line x1="29.5" y1="12" x2="29.5" y2="22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="29.5" cy="23.5" r="2" fill="currentColor"/>
    <path d="M11 19 L11 28" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M21 19 L21 28" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="11" y1="28" x2="21" y2="28" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </symbol>
  <symbol id="ic-nana" viewBox="0 0 48 48">
    <!-- Background circle -->
    <circle cx="24" cy="24" r="24" fill="#1B3252"/>
    <!-- Cardigan body -->
    <ellipse cx="24" cy="42" rx="13" ry="9" fill="#C17A4A"/>
    <!-- Neck -->
    <rect x="21" y="31" width="6" height="6" rx="2" fill="#F5C8A0"/>
    <!-- Head -->
    <circle cx="24" cy="23" r="11" fill="#F5C8A0"/>
    <!-- White hair — top bun -->
    <ellipse cx="24" cy="14" rx="7.5" ry="5" fill="#E0E0E0"/>
    <circle cx="24" cy="11" r="4.5" fill="#EBEBEB"/>
    <!-- White hair sides -->
    <ellipse cx="14" cy="20" rx="4" ry="6" fill="#E0E0E0"/>
    <ellipse cx="34" cy="20" rx="4" ry="6" fill="#E0E0E0"/>
    <!-- Blush cheeks -->
    <ellipse cx="17" cy="26" rx="3" ry="2" fill="#F4A0A0" opacity="0.4"/>
    <ellipse cx="31" cy="26" rx="3" ry="2" fill="#F4A0A0" opacity="0.4"/>
    <!-- Eyes -->
    <circle cx="20.5" cy="23" r="1.6" fill="#4A3728"/>
    <circle cx="27.5" cy="23" r="1.6" fill="#4A3728"/>
    <!-- Eye shine -->
    <circle cx="21.2" cy="22.3" r="0.5" fill="#fff"/>
    <circle cx="28.2" cy="22.3" r="0.5" fill="#fff"/>
    <!-- Glasses -->
    <circle cx="20.5" cy="23" r="3.5" stroke="#8B6347" stroke-width="1" fill="none"/>
    <circle cx="27.5" cy="23" r="3.5" stroke="#8B6347" stroke-width="1" fill="none"/>
    <line x1="24" y1="23" x2="24" y2="23" stroke="#8B6347" stroke-width="1"/>
    <line x1="23.5" y1="23" x2="24.5" y2="23" stroke="#8B6347" stroke-width="1"/>
    <line x1="13" y1="21.5" x2="17" y2="22.3" stroke="#8B6347" stroke-width="1"/>
    <line x1="31" y1="22.3" x2="35" y2="21.5" stroke="#8B6347" stroke-width="1"/>
    <!-- Smile -->
    <path d="M20 28 Q24 31.5 28 28" stroke="#C07850" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <!-- Pearl necklace -->
    <circle cx="21" cy="35" r="1.2" fill="#F0EDE8"/>
    <circle cx="24" cy="36.2" r="1.2" fill="#F0EDE8"/>
    <circle cx="27" cy="35" r="1.2" fill="#F0EDE8"/>
  </symbol>
  <symbol id="ic-send" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </symbol>
  <symbol id="ic-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </symbol>
  <symbol id="ic-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </symbol>
  <symbol id="ic-plane" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19.5 2.5S18 2 16.5 3.5L13 7 4.8 5.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
  </symbol>
  <symbol id="ic-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
  </symbol>
  <symbol id="ic-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0110 0v4"/>
  </symbol>
  <symbol id="ic-users" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87"/>
    <path d="M16 3.13a4 4 0 010 7.75"/>
  </symbol>
  <symbol id="ic-map" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
    <line x1="8" y1="2" x2="8" y2="18"/>
    <line x1="16" y1="6" x2="16" y2="22"/>
  </symbol>
</defs>
</svg>`
      }}
    />
  )
}
