// js/lib/icons.js
// The single icon library: inner markup of 16x16 line icons (stroke = currentColor), used by
// js/nav.js (navIcon), pages (iconSvg) and Vue pages (PhIcon). Native ES module, bridged onto `window`.
// A name present in both former sources (nav.js, portfolio.html) keeps the nav.js drawing.

export const ICON_PATHS = {
  pipeline:  '<path d="M2 12V8M8 12V4M14 12V6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  portfolio: '<rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/>',
  planning:  '<rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M2 6H14M5 2V4.5M11 2V4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  config:    '<circle cx="8" cy="8" r="2.4" stroke="currentColor" stroke-width="1.3"/><path d="M8 2v1.6M8 12.4V14M14 8h-1.6M3.6 8H2M12.1 3.9l-1.1 1.1M5 9.9l-1.1 1.1M12.1 12.1l-1.1-1.1M5 6.1L3.9 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  timesheets:'<rect x="2" y="4" width="12" height="9" rx="1.2" stroke="currentColor" stroke-width="1.3"/><path d="M2 4l1.6-2h8.8L14 4" stroke="currentColor" stroke-width="1.3"/>',
  user:      '<circle cx="8" cy="5.5" r="2.3" stroke="currentColor" stroke-width="1.3"/><path d="M3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" stroke="currentColor" stroke-width="1.3"/>',
  team:      '<circle cx="5.5" cy="5.5" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="11" cy="6.5" r="1.6" stroke="currentColor" stroke-width="1.2"/><path d="M2 14c0-2.3 1.7-3.8 3.9-3.8 1.6 0 2.9.8 3.5 2M9.6 10.3c1.6 0 3 1.1 3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  tag:       '<path d="M2 2h5.5L14 8.5 7.5 15 2 9.5V2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="5" cy="5" r="1" fill="currentColor"/>',
  dbreset:   '<ellipse cx="8" cy="3.5" rx="5.2" ry="1.8" stroke="currentColor" stroke-width="1.2"/><path d="M2.8 3.5v9c0 1 2.3 1.8 5.2 1.8s5.2-.8 5.2-1.8v-9M2.8 8c0 1 2.3 1.8 5.2 1.8s5.2-.8 5.2-1.8" stroke="currentColor" stroke-width="1.2"/>',
  terms:     '<path d="M4 2h5.5L13 5.5V14H4V2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6 8h5M6 10.5h5M6 5.5h2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
  notify:    '<path d="M2 6.5v3l2.5.5L9 12.5V3.5L4.5 6 2 6.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M11 6.3c.8.5 1.3 1.3 1.3 2.2s-.5 1.7-1.3 2.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M4.5 10v2.3c0 .7.6 1.2 1.2 1l.8-.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  key:       '<circle cx="5" cy="9" r="2.6" stroke="currentColor" stroke-width="1.2"/><path d="M7 7.2 13 1.2M11.2 3l1.6 1.6M9.4 4.8 11 6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  signout:   '<path d="M6.5 2H3.3c-.7 0-1.3.6-1.3 1.3v9.4c0 .7.6 1.3 1.3 1.3h3.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 11l3-3-3-3M13 8H6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  bell:      '<path d="M8 2.2c-.3 0-.6.1-.8.3-1.7.4-3 2-3 3.9v2.1c0 .5-.2 1-.5 1.4L3 10.6c-.3.3-.1.9.3.9h9.4c.4 0 .6-.6.3-.9l-.7-.7c-.3-.4-.5-.9-.5-1.4V6.4c0-1.9-1.3-3.5-3-3.9-.2-.2-.5-.3-.8-.3Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.3 13c.3.6.9 1 1.7 1s1.4-.4 1.7-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  lock:      '<rect x="3.5" y="7" width="9" height="6.5" rx="1.3" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  chevronLeft:  '<path d="M10 3.5L5.5 8 10 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronRight: '<path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    'chevron-right': '<path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    'chevron-down': '<path d="M3.5 6L8 10.5 12.5 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.4"/>',
    list: '<path d="M2.5 4H13.5M2.5 8H13.5M2.5 12H13.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    gear: '<circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 2.5V4M8 12V13.5M13.5 8H12M4 8H2.5M11.8 4.2L10.8 5.2M5.2 10.8L4.2 11.8M11.8 11.8L10.8 10.8M5.2 5.2L4.2 4.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    'arrow-right': '<path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    close: '<path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    check: '<path d="M3 8.5L6.5 12 13 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    upload: '<path d="M8 10.5V2.5M8 2.5L5 5.5M8 2.5L11 5.5M2.5 10.5V13H13.5V10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 6.5H13.5M5.5 2V5M10.5 2V5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    share: '<circle cx="4" cy="8" r="1.8" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="4" r="1.8" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="1.8" stroke="currentColor" stroke-width="1.4"/><path d="M5.6 7.1L10.4 4.9M5.6 8.9L10.4 11.1" stroke="currentColor" stroke-width="1.4"/>',
    download: '<path d="M8 2.5V10.5M8 10.5L5 7.5M8 10.5L11 7.5M2.5 10.5V13H13.5V10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    search: '<circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.6"/><path d="M11 11L14.5 14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  configure: '<circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 2.5V4M8 12V13.5M13.5 8H12M4 8H2.5M11.8 4.2L10.8 5.2M5.2 10.8L4.2 11.8M11.8 11.8L10.8 10.8M5.2 5.2L4.2 4.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  'chevron-left': '<path d="M10 3.5L5.5 8 10 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  save:         '<path d="M3 2.5h8l2.5 2.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5 2.5v3.5h5V2.5M5 13.5V9.5h6v4" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  clone:        '<rect x="5.5" y="5.5" width="8" height="8" rx="1.3" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 3.5V3.3c0-.5-.4-.8-.8-.8H3.3c-.5 0-.8.4-.8.8v6.4c0 .4.3.8.8.8h.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  plus:         '<path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  chevronDown:  '<path d="M3.5 6L8 10.5 12.5 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
};

export function iconSvg(name, size = 16, cls = '') {
  const paths = ICON_PATHS[name];
  if (!paths) return '';
  return `<svg class="pd-icon${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">${paths}</svg>`;
}

export const PhIcon = {
  props: { name: { type: String, required: true }, size: { type: Number, default: 16 } },
  template: `<svg class="pd-icon" :width="size" :height="size" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" v-html="paths"></svg>`,
  computed: { paths() { return ICON_PATHS[this.name] || ''; } },
};

if (typeof window !== 'undefined') {
  window.ICON_PATHS = ICON_PATHS;
  window.iconSvg = iconSvg;
  window.PhIcon = PhIcon;
}
