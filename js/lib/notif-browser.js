export function shouldShowBrowserNotification(permission, isPageVisible) {
  return permission === 'granted' && !isPageVisible;
}

window.shouldShowBrowserNotification = shouldShowBrowserNotification;
