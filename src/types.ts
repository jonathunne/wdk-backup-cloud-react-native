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
 * Core type definitions — no runtime code.
 */

// ---------------------------------------------------------------------------
// Provider contract
// ---------------------------------------------------------------------------

/**
 * Abstraction over any cloud storage backend.
 * Implementations should expose cloud operations without persisting backup
 * data locally inside this SDK.
 */
export interface CloudProvider {
  /**
   * Store `encryptedKey` in the provider's cloud storage.
   * If a backup already exists, it MUST be overwritten.
   */
  upload(encryptedKey: string, metadata: Record<string, unknown>): Promise<CloudEncryptionKeyFile | null>;

  /**
   * Retrieve the stored encrypted key and metadata.
   * Returns `null` if no backup exists yet.
   */
  download(): Promise<CloudEncryptionKeyFile | null>;

  /**
   * Permanently remove the stored backup.
   * Must be idempotent — calling on a missing file must NOT throw.
   */
  delete(): Promise<void>;

  /**
   * Returns `true` if the provider is accessible right now.
   * Should be a lightweight probe — not a full upload/download.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Returns `true` if a backup file exists in cloud storage.
   * Does not download the content.
   */
  exists(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Provider configurations
// ---------------------------------------------------------------------------

/**
 * Config for {@link GoogleDriveProvider}.
 * The caller is responsible for acquiring and refreshing the token.
 * This SDK performs NO OAuth flows.
 */
export interface GoogleDriveConfig {
  /** A valid OAuth2 access token scoped to `drive.appdata`. */
  readonly accessToken: string;
  /** Override the backup file path. Default: `wallet_backup_key.json` */
  readonly filePath?: string;
  /** The user's cloud email — stored inside the backup file for traceability. */
  readonly cloudEmail?: string;
}

/**
 * Config for {@link ICloudProvider}.
 */
export interface ICloudConfig {
  /** Override the backup file path. Default: `wallet_backup_key.json` */
  readonly filePath?: string;
  /** The user's cloud email — stored inside the backup file for traceability. */
  readonly cloudEmail?: string;
}

// ---------------------------------------------------------------------------
// Stored payload shape
// ---------------------------------------------------------------------------

/**
 * The JSON blob written to cloud storage by every provider.
 * Matches the proven format from the reference implementation.
 */
export interface CloudEncryptionKeyFile {
  /** The encrypted wallet master key */
  readonly encryptionKey: string;
  /** ISO-8601 UTC timestamp when the backup was saved */
  readonly savedAt: string;
  /** Platform that created this backup */
  readonly platform: "ios" | "android";
  /** Schema version */
  readonly version: number;
  /** Cloud user email that owns this backup */
  readonly cloudEmail: string;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * Rich result from cloud key retrieval — includes metadata about the attempt.
 */
export interface CloudKeyResult {
  /** The encryption key, or null if not found / cancelled */
  key: string | null;
  /** The Google/cloud account email used (Android), or null (iOS) */
  cloudEmail: string | null;
  /** True if the backup file was not found in cloud storage */
  notFound: boolean;
  /** True if the user cancelled the cloud sign-in */
  userCancelled: boolean;
}
