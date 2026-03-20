// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * ICloudProvider — stores the encrypted master key in the device's iCloud
 * via `react-native-cloud-storage` using `CloudStorageScope.AppData`.
 *
 * Design constraints:
 *  - File stored via AppData scope (app-specific hidden folder).
 *  - File path is configurable for per-user naming.
 *  - Payload is `CloudEncryptionKeyFile` JSON.
 *  - Handles: iCloud disabled, user not signed in, quota errors, I/O errors.
 *  - Never logs the encrypted key material.
 */

import { CloudStorage, CloudStorageScope } from "react-native-cloud-storage";
import {
  CloudAuthError,
  CloudStorageError,
  CloudUnavailableError,
} from "../errors.js";
import type {
  CloudEncryptionKeyFile,
  CloudProvider,
  ICloudConfig,
} from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FILE_PATH = "wallet_backup_key.json";
const DEFAULT_MAX_SYNC_RETRIES = 10;
const DEFAULT_SYNC_RETRY_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ICloudProvider implements CloudProvider {
  private readonly filePath: string;
  private readonly cloudEmail: string;
  private readonly maxSyncRetries: number;
  private readonly syncRetryDelayMs: number;

  constructor(config: ICloudConfig = {}) {
    this.filePath = config.filePath ?? DEFAULT_FILE_PATH;
    this.cloudEmail = config.cloudEmail ?? "";
    this.maxSyncRetries = config.maxSyncRetries ?? DEFAULT_MAX_SYNC_RETRIES;
    this.syncRetryDelayMs = config.syncRetryDelayMs ?? DEFAULT_SYNC_RETRY_DELAY_MS;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async upload(
    encryptedKey: string,
    metadata: Record<string, unknown>,
  ): Promise<CloudEncryptionKeyFile | null> {
    await this.assertAvailable();

    const payload: CloudEncryptionKeyFile = {
      encryptionKey: encryptedKey,
      savedAt: metadata.savedAt
        ? metadata.savedAt.toString()
        : new Date().toISOString(),
      platform: "ios",
      version: metadata.version ? (metadata.version as number) : 1,
      cloudEmail: this.cloudEmail,
    };

    try {
      await CloudStorage.writeFile(
        this.filePath,
        JSON.stringify(payload),
        CloudStorageScope.AppData,
      );
    } catch (cause) {
      throw this.mapError(cause, "Failed to write backup to iCloud");
    }

    try {
      const verified = await CloudStorage.exists(
        this.filePath,
        CloudStorageScope.AppData,
      );
      if (!verified) {
        throw new CloudStorageError(
          "iCloud backup failed: file not found after write",
        );
      }
      return payload;
    } catch (cause) {
      if (cause instanceof CloudStorageError) throw cause;
      throw this.mapError(cause, "Failed to verify iCloud backup");
    }
  }

  async download(): Promise<CloudEncryptionKeyFile | null> {
    await this.assertAvailable();

    const available = await this.isFileAvailable();
    if (!available) return null;

    try {
      await CloudStorage.triggerSync(
        this.filePath,
        CloudStorageScope.AppData,
      );
    } catch {
      // triggerSync may fail if the file is already local; safe to ignore
    }

    let raw: string | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxSyncRetries; attempt++) {
      try {
        raw = await CloudStorage.readFile(
          this.filePath,
          CloudStorageScope.AppData,
        );
        break;
      } catch (cause) {
        lastError = cause;
        if (attempt < this.maxSyncRetries) {
          await new Promise((r) => setTimeout(r, this.syncRetryDelayMs));
        }
      }
    }

    if (raw === undefined) {
      throw this.mapError(
        lastError,
        `Failed to read backup from iCloud after ${this.maxSyncRetries} attempts (file may still be downloading)`,
      );
    }

    const payload = this.parsePayload(raw);
    return payload;
  }

  async delete(): Promise<void> {
    await this.assertAvailable();

    const available = await this.isFileAvailable();
    if (!available) return;

    try {
      await CloudStorage.unlink(this.filePath, CloudStorageScope.AppData);
    } catch (cause) {
      throw this.mapError(cause, "Failed to delete backup from iCloud");
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const available = await CloudStorage.isCloudAvailable();
      return available;
    } catch {
      return false;
    }
  }

  async exists(): Promise<boolean> {
    try {
      const available = await CloudStorage.isCloudAvailable();
      if (!available) return false;

      return await this.isFileAvailable();
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * iCloud files not yet downloaded to the device appear as placeholder files
   * named `.{filename}.icloud`. This converts a path to its placeholder form.
   */
  private getPlaceholderPath(filePath: string): string {
    const lastSlash = filePath.lastIndexOf("/");
    if (lastSlash === -1) return `.${filePath}.icloud`;
    const dir = filePath.substring(0, lastSlash + 1);
    const name = filePath.substring(lastSlash + 1);
    return `${dir}.${name}.icloud`;
  }

  /**
   * Check if the backup file is available — either downloaded locally or
   * present as an iCloud `.icloud` placeholder waiting to be downloaded.
   */
  private async isFileAvailable(): Promise<boolean> {
    try {
      const directExists = await CloudStorage.exists(
        this.filePath,
        CloudStorageScope.AppData,
      );
      if (directExists) return true;

      const placeholderExists = await CloudStorage.exists(
        this.getPlaceholderPath(this.filePath),
        CloudStorageScope.AppData,
      );
      return placeholderExists;
    } catch {
      return false;
    }
  }

  /** Throws CloudUnavailableError or CloudAuthError if iCloud isn't ready. */
  private async assertAvailable(): Promise<void> {
    let available: boolean;
    try {
      available = await CloudStorage.isCloudAvailable();
    } catch (cause) {
      throw new CloudUnavailableError(
        "iCloud availability check failed",
        cause,
      );
    }

    if (!available) {
      throw new CloudUnavailableError(
        "iCloud is not available. Ensure iCloud Drive is enabled in Settings.",
      );
    }
  }

  /**
   * Map react-native-cloud-storage errors to our typed error hierarchy.
   */
  private mapError(cause: unknown, context: string): Error {
    const msg =
      cause instanceof Error ? cause.message.toLowerCase() : String(cause);

    if (
      msg.includes("not signed in") ||
      msg.includes("icloud account") ||
      msg.includes("no account")
    ) {
      return new CloudAuthError(
        `iCloud user not signed in — ${context}`,
        cause,
      );
    }

    if (
      msg.includes("quota") ||
      msg.includes("insufficient storage") ||
      msg.includes("storage full")
    ) {
      return new CloudStorageError(
        `iCloud storage quota exceeded — ${context}`,
        cause,
      );
    }

    if (
      msg.includes("unavailable") ||
      msg.includes("disabled") ||
      msg.includes("not available")
    ) {
      return new CloudUnavailableError(
        `iCloud service unavailable — ${context}`,
        cause,
      );
    }

    return new CloudStorageError(`${context}: ${msg}`, cause);
  }

  /** Narrow raw JSON string → `CloudEncryptionKeyFile` defensively. */
  private parsePayload(raw: string): CloudEncryptionKeyFile {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (cause) {
      throw new CloudStorageError(
        "iCloud backup file contains invalid JSON",
        cause,
      );
    }

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>)["encryptionKey"] !== "string"
    ) {
      throw new CloudStorageError(
        "iCloud backup payload has an unexpected shape",
      );
    }

    return parsed as CloudEncryptionKeyFile;
  }
}
