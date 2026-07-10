import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { ApiService } from './api.service';

/**
 * Native push registration (Capacitor). On the mobile app it asks for
 * permission, registers the device's FCM/APNs token with the backend
 * (`POST /notifications/devices`), and routes taps to the right screen. On the
 * web it's a no-op — the portal bell already surfaces the same feed.
 *
 * Plugins are imported dynamically so the web build never bundles native code.
 */
@Injectable({ providedIn: 'root' })
export class PushRegistrationService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private started = false;

  /** Call once after login on the app. Safe (and cheap) to call on the web. */
  async init(): Promise<void> {
    if (this.started || !Capacitor.isNativePlatform()) return;
    this.started = true;
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      const perm = await PushNotifications.checkPermissions();
      let status = perm.receive;
      if (status === 'prompt' || status === 'prompt-with-rationale') {
        status = (await PushNotifications.requestPermissions()).receive;
      }
      if (status !== 'granted') return;

      PushNotifications.addListener('registration', (token) => {
        this.api.post('/notifications/devices', {
          token: token.value,
          platform: Capacitor.getPlatform(),
          appVariant: (window as any).__WA_VARIANT || 'full',
        }).subscribe({ next: () => {}, error: () => {} });
      });

      PushNotifications.addListener('registrationError', () => { /* ignore — retried next launch */ });

      // Tap on a notification → deep-link to the entity (route rides in data).
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const route = action.notification?.data?.route;
        if (route) this.router.navigateByUrl(route).catch(() => {});
      });

      // Foreground receipt → mirror it as a local notification so it's visible.
      PushNotifications.addListener('pushNotificationReceived', async (n) => {
        try {
          const { LocalNotifications } = await import('@capacitor/local-notifications');
          await LocalNotifications.schedule({
            notifications: [{
              id: Math.floor(Math.random() * 1e6),
              title: n.title || 'Notification',
              body: n.body || '',
              extra: n.data,
            }],
          });
        } catch { /* local-notifications optional */ }
      });

      await PushNotifications.register();
    } catch { /* not a native runtime — ignore */ }
  }

  /** Best-effort unregister on logout (stops pushes to this device). */
  async unregister(token?: string): Promise<void> {
    if (!token) return;
    this.api.delete(`/notifications/devices/${encodeURIComponent(token)}`).subscribe({ next: () => {}, error: () => {} });
  }
}
