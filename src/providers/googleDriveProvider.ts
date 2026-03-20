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
 * GoogleDriveProvider — stores the encrypted master key in the caller's
 * Google Drive `appDataFolder` via `react-native-cloud-storage`.
 *
 * Design constraints:
 *  - No Google sign-in logic. The caller injects a valid OAuth2 access token.
 *  - Uses `react-native-cloud-storage` (same library as iCloud) with
 *    `CloudStorageScope.AppData` for consistent cross-platform behaviour.
 *  - "Could not get file id" from the library means file doesn't exist —
 *    handled gracefully.
 *  - Never logs the access token or encrypted key material.
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
  GoogleDriveConfig,
} from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FILE_PATH = "wallet_backup_key.json";

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class GoogleDriveProvider implements CloudProvider {
  private readonly filePath: string;
  private readonly cloudEmail: string;

  constructor(config: GoogleDriveConfig) {
    this.filePath = config.filePath ?? DEFAULT_FILE_PATH;
    this.cloudEmail = config.cloudEmail ?? "";

    CloudStorage.setProviderOptions({
      accessToken: config.accessToken,
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async upload(
    encryptedKey: string,
    metadata: Record<string, unknown>,
  ): Promise<CloudEncryptionKeyFile | null> {
    const payload: CloudEncryptionKeyFile = {
      encryptionKey: encryptedKey,
      savedAt: metadata.savedAt
        ? metadata.savedAt.toString()
        : new Date().toISOString(),
      platform: "android",
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
      throw this.mapError(cause, "Failed to write backup to Google Drive");
    }

    try {
      const verified = await CloudStorage.exists(
        this.filePath,
        CloudStorageScope.AppData,
      );
      if (!verified) {
        throw new CloudStorageError(
          "Google Drive backup failed: file not found after write",
        );
      }
      return payload;
    } catch (cause) {
      if (cause instanceof CloudStorageError) throw cause;
      throw this.mapError(cause, "Failed to verify Google Drive backup");
    }
  }

  async download(): Promise<CloudEncryptionKeyFile | null> {
    let fileExists: boolean;
    try {
      fileExists = await CloudStorage.exists(
        this.filePath,
        CloudStorageScope.AppData,
      );
    } catch (cause) {
      if (this.isFileNotFoundError(cause)) return null;
      throw this.mapError(cause, "Failed to check Google Drive file existence");
    }

    if (!fileExists) return null;

    let raw: string;
    try {
      raw = await CloudStorage.readFile(
        this.filePath,
        CloudStorageScope.AppData,
      );
    } catch (cause) {
      throw this.mapError(cause, "Failed to read backup from Google Drive");
    }

    const payload = this.parsePayload(raw);
    return payload;
  }

  async delete(): Promise<void> {
    let fileExists: boolean;
    try {
      fileExists = await CloudStorage.exists(
        this.filePath,
        CloudStorageScope.AppData,
      );
    } catch (cause) {
      if (this.isFileNotFoundError(cause)) return;
      throw this.mapError(cause, "Failed to check Google Drive file existence");
    }

    if (!fileExists) return;

    try {
      await CloudStorage.unlink(this.filePath, CloudStorageScope.AppData);
    } catch (cause) {
      throw this.mapError(cause, "Failed to delete backup from Google Drive");
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await CloudStorage.isCloudAvailable();
    } catch {
      return false;
    }
  }

  async exists(): Promise<boolean> {
    try {
      return await CloudStorage.exists(
        this.filePath,
        CloudStorageScope.AppData,
      );
    } catch (cause) {
      if (this.isFileNotFoundError(cause)) return false;
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * On Android, "Could not get file id" means the file doesn't exist
   * in Google Drive's appDataFolder. This is normal for new users.
   */
  private isFileNotFoundError(cause: unknown): boolean {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return msg.includes("Could not get file id");
  }

  /**
   * Map react-native-cloud-storage errors to our typed error hierarchy.
   */
  private mapError(cause: unknown, context: string): Error {
    const msg =
      cause instanceof Error ? cause.message.toLowerCase() : String(cause);

    if (
      msg.includes("unauthorized") ||
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("auth")
    ) {
      return new CloudAuthError(
        `Google Drive authentication failed — ${context}`,
        cause,
      );
    }

    if (
      msg.includes("unavailable") ||
      msg.includes("network") ||
      msg.includes("not available")
    ) {
      return new CloudUnavailableError(
        `Google Drive unavailable — ${context}`,
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
        "Google Drive backup file contains invalid JSON",
        cause,
      );
    }

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>)["encryptionKey"] !== "string"
    ) {
      throw new CloudStorageError(
        "Google Drive backup payload has an unexpected shape",
      );
    }

    return parsed as CloudEncryptionKeyFile;
  }
}
