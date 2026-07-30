import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

/**
 * Browser push for the field-sales app. Registers a tiny service worker,
 * subscribes via the PushManager using the server's VAPID public key, and
 * persists the subscription. Everything degrades gracefully: unsupported
 * browsers, denied permission, or an unconfigured server all just leave the
 * toggle off. Reps opt in from the My Sales header.
 */
@Injectable({ providedIn: 'root' })
export class WebPushService {
  private readonly api = inject(ApiService);
  readonly enabled = signal(false);
  readonly busy = signal(false);
  readonly available = signal(false);

  supported(): boolean {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
      typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
  }

  /** Called on app-view init: reflect current subscription + whether the server has VAPID. */
  async init(): Promise<void> {
    if (!this.supported()) return;
    try {
      const key = await firstValueFrom(this.api.get<{ publicKey: string; enabled: boolean }>('/sfa/app/push/key'));
      this.available.set(!!key?.enabled);
      const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      this.enabled.set(!!sub && Notification.permission === 'granted');
    } catch { /* not signed in / server without push — stay off */ }
  }

  async enable(): Promise<boolean> {
    if (!this.supported() || this.busy()) return false;
    this.busy.set(true);
    try {
      const key = await firstValueFrom(this.api.get<{ publicKey: string; enabled: boolean }>('/sfa/app/push/key'));
      if (!key?.enabled || !key.publicKey) return false;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return false;
      const reg = await navigator.serviceWorker.register('/push-sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(key.publicKey) as BufferSource,
      });
      await firstValueFrom(this.api.post('/sfa/app/push/subscribe', { subscription: sub.toJSON() }));
      this.enabled.set(true);
      return true;
    } catch {
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await firstValueFrom(this.api.post('/sfa/app/push/unsubscribe', { endpoint: sub.endpoint })).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      this.enabled.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  async toggle(): Promise<void> { if (this.enabled()) await this.disable(); else await this.enable(); }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
}
