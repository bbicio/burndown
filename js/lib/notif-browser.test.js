import { describe, it, expect } from 'vitest';
import { shouldShowBrowserNotification, getBrowserNotifBannerState } from './notif-browser.js';

describe('shouldShowBrowserNotification', () => {
  it('shows when permission is granted and the page is not visible', () => {
    expect(shouldShowBrowserNotification('granted', false)).toBe(true);
  });

  it('does not show when the page is already visible, even with permission granted', () => {
    expect(shouldShowBrowserNotification('granted', true)).toBe(false);
  });

  it('does not show when permission is denied, regardless of visibility', () => {
    expect(shouldShowBrowserNotification('denied', false)).toBe(false);
    expect(shouldShowBrowserNotification('denied', true)).toBe(false);
  });

  it('does not show when permission is still default (never asked)', () => {
    expect(shouldShowBrowserNotification('default', false)).toBe(false);
  });

  it('does not show when the user has opted out locally, even with permission granted', () => {
    expect(shouldShowBrowserNotification('granted', false, true)).toBe(false);
  });

  it('defaults optedOut to false when omitted', () => {
    expect(shouldShowBrowserNotification('granted', false)).toBe(true);
  });
});

describe('getBrowserNotifBannerState', () => {
  it('offers to Enable when permission was never asked', () => {
    expect(getBrowserNotifBannerState('default', false)).toEqual({ visible: true, label: 'Enable' });
  });

  it('offers to Disable when granted and not opted out', () => {
    expect(getBrowserNotifBannerState('granted', false)).toEqual({ visible: true, label: 'Disable' });
  });

  it('offers to Enable again when granted but the user opted out locally', () => {
    expect(getBrowserNotifBannerState('granted', true)).toEqual({ visible: true, label: 'Enable' });
  });

  it('hides entirely when the browser itself has denied permission — nothing this app can offer', () => {
    expect(getBrowserNotifBannerState('denied', false)).toEqual({ visible: false, label: null });
    expect(getBrowserNotifBannerState('denied', true)).toEqual({ visible: false, label: null });
  });
});
