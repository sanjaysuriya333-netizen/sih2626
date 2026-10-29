// Lets any page tell the bell to refresh its count (no component here, so ESLint is happy)
export const NOTIFICATIONS_CHANGED = 'notifications:changed';

export function announceNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}