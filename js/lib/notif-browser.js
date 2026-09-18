export function shouldShowBrowserNotification(permission, isPageVisible, optedOut = false) {
  return permission === 'granted' && !isPageVisible && !optedOut;
}

export function getBrowserNotifBannerState(permission, optedOut) {
  if (permission === 'denied') return { visible: false, label: null };
  if (permission === 'default') return { visible: true, label: 'Enable' };
  return { visible: true, label: optedOut ? 'Enable' : 'Disable' };
}

window.shouldShowBrowserNotification = shouldShowBrowserNotification;
window.getBrowserNotifBannerState = getBrowserNotifBannerState;
