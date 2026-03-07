/**
 * @tetherto/wdk-backup-cloud-react-native
 * Integration usage example.
 *
 * This file is for demonstration purposes. It requires
 * `react-native-cloud-storage` at runtime, and the Google Drive examples
 * also require a valid OAuth token.
 */

import {
  CloudBackup,
  CloudAuthError,
  CloudStorageError,
  CloudUnavailableError,
  CloudValidationError,
  GoogleDriveProvider,
  ICloudProvider,
} from "@tetherto/wdk-backup-cloud-react-native";

// =============================================================================
// Example 1 — Google Drive
// =============================================================================

async function backupWithGoogleDrive(
  accessToken: string,
  encryptedKey: string,
): Promise<void> {
  const provider = new GoogleDriveProvider({ accessToken });
  const cloud = new CloudBackup(provider);

  // ----- Check availability before attempting -----
  const available = await cloud.isAvailable();
  if (!available) {
    console.warn("Google Drive is not accessible right now. Skipping backup.");
    return;
  }

  try {
    // ---- Upload (create or overwrite) ----
    await cloud.uploadEncryptedKey(encryptedKey, { version: 1 });
    console.info("Backup uploaded to Google Drive successfully.");

    // ---- Download ----
    const downloaded = await cloud.downloadEncryptedKey();
    if (downloaded === null) {
      console.warn("No backup found in Google Drive.");
    } else {
      console.info("Backup downloaded — key retrieved (value not logged).");
    }

    // ---- Delete (e.g., on wallet wipe) ----
    await cloud.deleteBackup();
    console.info("Backup deleted from Google Drive.");
  } catch (err) {
    if (err instanceof CloudValidationError) {
      // Caller passed an empty key — program error
      console.error("Invalid key supplied:", err.message);
    } else if (err instanceof CloudAuthError) {
      // Refresh the access token, then retry
      console.error(
        "Authentication failed — refresh token and retry:",
        err.message,
      );
    } else if (err instanceof CloudUnavailableError) {
      // Network down or Drive service unavailable
      console.error("Google Drive unavailable:", err.message);
    } else if (err instanceof CloudStorageError) {
      // Quota exceeded, server error, etc.
      console.error("Storage error:", err.message);
    } else {
      throw err; // unexpected — re-throw
    }
  }
}

// =============================================================================
// Example 2 — iCloud
// =============================================================================

async function backupWithICloud(encryptedKey: string): Promise<void> {
  const provider = new ICloudProvider(); // default path: wallet_backup_key.json
  const cloud = new CloudBackup(provider);

  const available = await cloud.isAvailable();
  if (!available) {
    console.warn(
      "iCloud is not available. Ensure iCloud Drive is enabled in Settings.",
    );
    return;
  }

  try {
    await cloud.uploadEncryptedKey(encryptedKey, { version: 1 });
    console.info("Backup uploaded to iCloud.");

    const downloaded = await cloud.downloadEncryptedKey();
    if (downloaded !== null) {
      console.info("Backup verified in iCloud.");
    }
  } catch (err) {
    if (err instanceof CloudAuthError) {
      console.error("iCloud: user not signed in:", err.message);
    } else if (err instanceof CloudUnavailableError) {
      console.error("iCloud unavailable:", err.message);
    } else if (err instanceof CloudStorageError) {
      console.error("iCloud storage error (quota?):", err.message);
    } else {
      throw err;
    }
  }
}

// =============================================================================
// Example 3 — Full flow: backend upload + cloud backup (see @tetherto/wdk-backup-remote)
// =============================================================================

/**
 * Demonstrates how the two packages fit together.
 * BackendBackupClient is from @tetherto/wdk-backup-remote (not shown here).
 */
async function fullBackupFlow(
  accessToken: string,
  encryptedKey: string,
): Promise<void> {
  /*
  const backend = new BackendBackupClient({
    baseUrl: 'https://api.mywallet.com',
  });

  // 1. Upload to backend
  await backend.uploadSeed({ encryptedSeed, authToken, deviceId });
  await backend.uploadEntropy({ encryptedEntropy, authToken, deviceId });
  */

  // 2. Upload to cloud (Google Drive in this example)
  const cloudProvider = new GoogleDriveProvider({ accessToken });
  const cloud = new CloudBackup(cloudProvider);

  await cloud.uploadEncryptedKey(encryptedKey, { version: 1 });

  console.info("Full backup complete — backend + cloud.");
}

export { backupWithGoogleDrive, backupWithICloud, fullBackupFlow };
