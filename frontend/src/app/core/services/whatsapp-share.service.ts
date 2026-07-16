import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { ApiService } from './api.service';

/**
 * Vyapar-style "share via the phone's OWN WhatsApp" — the zero-ban-risk way to send
 * an invoice/receipt on mobile. Instead of automating a linked account (Baileys), we
 * fetch the PDF, write it to the device, and hand it to WhatsApp through the OS share
 * sheet. The user taps send inside their real WhatsApp app, so it's indistinguishable
 * from a normal human share — no account linking, no ban surface.
 *
 * Only works inside the Capacitor native app AND when the Share/Filesystem plugins are
 * present (i.e. a build that shipped them). On web, or an older APK without the
 * plugins, `shareDocument` returns false so the caller can fall back to the safe
 * server path (official WhatsApp API / wa.me).
 */
@Injectable({ providedIn: 'root' })
export class WhatsappShareService {
  private readonly api = inject(ApiService);

  /** True only inside the native app (Android/iOS). */
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Fetch a PDF from an authenticated API path, save it to the device cache, and open
   * the share sheet with the file so the user can send it via their own WhatsApp.
   * Returns true if the share sheet opened, false to signal "fall back to the web path".
   */
  async shareDocument(pdfPath: string, filename: string, text: string): Promise<boolean> {
    if (!this.isNative()) return false;
    try {
      const blob = await firstValueFrom(this.api.getBlob(pdfPath));
      const base64 = await this.blobToBase64(blob);
      await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: filename });
      await Share.share({ title: filename, text, files: [uri], dialogTitle: 'Share via WhatsApp' });
      return true;
    } catch {
      // Old APK without the Share plugin, user-cancelled, or a fetch error → let the
      // caller use the safe server send instead.
      return false;
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onloadend = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result); // strip the data: prefix
      };
      reader.readAsDataURL(blob);
    });
  }
}
