import { CloudStorage, CloudStorageScope } from 'react-native-cloud-storage';
import { ICloudProvider } from '../providers/iCloudProvider';
import {
  CloudAuthError,
  CloudStorageError,
  CloudUnavailableError,
} from '../errors';
import type { CloudEncryptionKeyFile } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENCRYPTED_KEY = 'encrypted_master_key_hex';
const DEFAULT_PATH = 'wallet_backup_key.json';
const PLACEHOLDER_PATH = `.${DEFAULT_PATH}.icloud`;
const METADATA = { version: 1 };

const VALID_PAYLOAD: CloudEncryptionKeyFile = {
  encryptionKey: ENCRYPTED_KEY,
  savedAt: '2026-02-25T00:00:00.000Z',
  platform: 'ios',
  version: 1,
  cloudEmail: '',
};

const cloudStorageMock = CloudStorage as jest.Mocked<typeof CloudStorage>;

function makeAvailable(): void {
  cloudStorageMock.isCloudAvailable.mockResolvedValue(true);
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// upload
// ---------------------------------------------------------------------------

describe('ICloudProvider.upload', () => {
  it('writes CloudEncryptionKeyFile JSON to the default path', async () => {
    makeAvailable();
    cloudStorageMock.writeFile.mockResolvedValue(undefined);
    cloudStorageMock.exists.mockResolvedValue(true);

    await new ICloudProvider().upload(ENCRYPTED_KEY, METADATA);

    expect(cloudStorageMock.writeFile).toHaveBeenCalledTimes(1);
    const [path, content, scope] = cloudStorageMock.writeFile.mock.calls[0]!;
    expect(path).toBe(DEFAULT_PATH);
    expect(scope).toBe(CloudStorageScope.AppData);

    const parsed = JSON.parse(content) as CloudEncryptionKeyFile;
    expect(parsed.version).toBe(1);
    expect(parsed.encryptionKey).toBe(ENCRYPTED_KEY);
    expect(parsed.platform).toBe('ios');
    expect(typeof parsed.savedAt).toBe('string');
  });

  it('writes to custom path when configured', async () => {
    makeAvailable();
    cloudStorageMock.writeFile.mockResolvedValue(undefined);
    cloudStorageMock.exists.mockResolvedValue(true);

    const provider = new ICloudProvider({ filePath: 'custom/path.json' });
    await provider.upload(ENCRYPTED_KEY, METADATA);

    expect(cloudStorageMock.writeFile.mock.calls[0]![0]).toBe('custom/path.json');
  });

  it('throws CloudUnavailableError when iCloud is not available', async () => {
    cloudStorageMock.isCloudAvailable.mockResolvedValue(false);
    await expect(
      new ICloudProvider().upload(ENCRYPTED_KEY, METADATA),
    ).rejects.toBeInstanceOf(CloudUnavailableError);
    expect(cloudStorageMock.writeFile).not.toHaveBeenCalled();
  });

  it('throws CloudAuthError when user is not signed in', async () => {
    makeAvailable();
    cloudStorageMock.writeFile.mockRejectedValue(
      new Error('iCloud account not signed in'),
    );
    await expect(
      new ICloudProvider().upload(ENCRYPTED_KEY, METADATA),
    ).rejects.toBeInstanceOf(CloudAuthError);
  });

  it('throws CloudStorageError on quota exceeded', async () => {
    makeAvailable();
    cloudStorageMock.writeFile.mockRejectedValue(
      new Error('Insufficient storage quota'),
    );
    await expect(
      new ICloudProvider().upload(ENCRYPTED_KEY, METADATA),
    ).rejects.toBeInstanceOf(CloudStorageError);
  });

  it('throws CloudStorageError on generic write failure', async () => {
    makeAvailable();
    cloudStorageMock.writeFile.mockRejectedValue(new Error('I/O error'));
    await expect(
      new ICloudProvider().upload(ENCRYPTED_KEY, METADATA),
    ).rejects.toBeInstanceOf(CloudStorageError);
  });

  it('throws CloudUnavailableError if isCloudAvailable check itself throws', async () => {
    cloudStorageMock.isCloudAvailable.mockRejectedValue(new Error('native crash'));
    await expect(
      new ICloudProvider().upload(ENCRYPTED_KEY, METADATA),
    ).rejects.toBeInstanceOf(CloudUnavailableError);
  });

  it('returns the written payload on success', async () => {
    makeAvailable();
    cloudStorageMock.writeFile.mockResolvedValue(undefined);
    cloudStorageMock.exists.mockResolvedValue(true);

    const result = await new ICloudProvider().upload(ENCRYPTED_KEY, METADATA);
    expect(result).not.toBeNull();
    expect(result!.encryptionKey).toBe(ENCRYPTED_KEY);
    expect(result!.version).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------

describe('ICloudProvider.download', () => {
  it('returns CloudEncryptionKeyFile for an existing backup', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.triggerSync.mockResolvedValue(undefined);
    cloudStorageMock.readFile.mockResolvedValue(JSON.stringify(VALID_PAYLOAD));

    const result = await new ICloudProvider().download();
    expect(result).not.toBeNull();
    expect(result!.encryptionKey).toBe(ENCRYPTED_KEY);
    expect(result!.version).toBe(1);
  });

  it('calls triggerSync before reading the file', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.triggerSync.mockResolvedValue(undefined);
    cloudStorageMock.readFile.mockResolvedValue(JSON.stringify(VALID_PAYLOAD));

    await new ICloudProvider().download();

    expect(cloudStorageMock.triggerSync).toHaveBeenCalledWith(
      DEFAULT_PATH,
      CloudStorageScope.AppData,
    );
    expect(cloudStorageMock.readFile).toHaveBeenCalledWith(
      DEFAULT_PATH,
      CloudStorageScope.AppData,
    );
  });

  it('succeeds even if triggerSync fails', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.triggerSync.mockRejectedValue(new Error('sync not needed'));
    cloudStorageMock.readFile.mockResolvedValue(JSON.stringify(VALID_PAYLOAD));

    const result = await new ICloudProvider().download();
    expect(result).not.toBeNull();
    expect(result!.encryptionKey).toBe(ENCRYPTED_KEY);
  });

  it('returns null when neither file nor .icloud placeholder exists', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(false);

    const result = await new ICloudProvider().download();
    expect(result).toBeNull();
    expect(cloudStorageMock.readFile).not.toHaveBeenCalled();
    expect(cloudStorageMock.triggerSync).not.toHaveBeenCalled();
  });

  it('downloads backup when only .icloud placeholder exists', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockImplementation((path: string) =>
      Promise.resolve(path === PLACEHOLDER_PATH),
    );
    cloudStorageMock.triggerSync.mockResolvedValue(undefined);
    cloudStorageMock.readFile.mockResolvedValue(JSON.stringify(VALID_PAYLOAD));

    const result = await new ICloudProvider().download();
    expect(result).not.toBeNull();
    expect(result!.encryptionKey).toBe(ENCRYPTED_KEY);
    expect(cloudStorageMock.triggerSync).toHaveBeenCalledWith(
      DEFAULT_PATH,
      CloudStorageScope.AppData,
    );
    expect(cloudStorageMock.readFile).toHaveBeenCalledWith(
      DEFAULT_PATH,
      CloudStorageScope.AppData,
    );
  });

  it('retries readFile when it fails initially then succeeds', async () => {
    jest.useFakeTimers();
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.triggerSync.mockResolvedValue(undefined);
    cloudStorageMock.readFile
      .mockRejectedValueOnce(new Error('file not ready'))
      .mockRejectedValueOnce(new Error('file not ready'))
      .mockResolvedValueOnce(JSON.stringify(VALID_PAYLOAD));

    const downloadPromise = new ICloudProvider().download();

    // Advance through retry delays
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);

    const result = await downloadPromise;
    expect(result).not.toBeNull();
    expect(result!.encryptionKey).toBe(ENCRYPTED_KEY);
    expect(cloudStorageMock.readFile).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });

  it('throws CloudStorageError on invalid JSON in file', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.triggerSync.mockResolvedValue(undefined);
    cloudStorageMock.readFile.mockResolvedValue('not json {{');

    await expect(new ICloudProvider().download()).rejects.toBeInstanceOf(
      CloudStorageError,
    );
  });

  it('throws CloudStorageError on payload with wrong shape', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.triggerSync.mockResolvedValue(undefined);
    cloudStorageMock.readFile.mockResolvedValue(JSON.stringify({ version: 2 }));

    await expect(new ICloudProvider().download()).rejects.toBeInstanceOf(
      CloudStorageError,
    );
  });

  it('throws CloudAuthError when readFile always fails with auth error', async () => {
    jest.useFakeTimers();
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.triggerSync.mockResolvedValue(undefined);
    cloudStorageMock.readFile.mockRejectedValue(new Error('no account'));

    const resultPromise = new ICloudProvider().download().catch((e: unknown) => e);
    await jest.runAllTimersAsync();
    const error = await resultPromise;
    expect(error).toBeInstanceOf(CloudAuthError);
    jest.useRealTimers();
  });

  it('throws CloudStorageError after all retry attempts are exhausted', async () => {
    jest.useFakeTimers();
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.triggerSync.mockResolvedValue(undefined);
    cloudStorageMock.readFile.mockRejectedValue(new Error('I/O error'));

    const resultPromise = new ICloudProvider().download().catch((e: unknown) => e);
    await jest.runAllTimersAsync();
    const error = await resultPromise;
    expect(error).toBeInstanceOf(CloudStorageError);
    expect(cloudStorageMock.readFile).toHaveBeenCalledTimes(10);
    jest.useRealTimers();
  });

  it('respects custom maxSyncRetries from config', async () => {
    jest.useFakeTimers();
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.triggerSync.mockResolvedValue(undefined);
    cloudStorageMock.readFile.mockRejectedValue(new Error('I/O error'));

    const provider = new ICloudProvider({ maxSyncRetries: 3 });
    const resultPromise = provider.download().catch((e: unknown) => e);
    await jest.runAllTimersAsync();
    const error = await resultPromise;
    expect(error).toBeInstanceOf(CloudStorageError);
    expect(cloudStorageMock.readFile).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });

  it('respects custom syncRetryDelayMs from config', async () => {
    jest.useFakeTimers();
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.triggerSync.mockResolvedValue(undefined);
    cloudStorageMock.readFile
      .mockRejectedValueOnce(new Error('not ready'))
      .mockResolvedValueOnce(JSON.stringify(VALID_PAYLOAD));

    const provider = new ICloudProvider({ syncRetryDelayMs: 500 });
    const downloadPromise = provider.download();

    // At 499ms the retry delay hasn't elapsed yet
    await jest.advanceTimersByTimeAsync(499);
    expect(cloudStorageMock.readFile).toHaveBeenCalledTimes(1);

    // At 500ms the delay completes and the second attempt runs
    await jest.advanceTimersByTimeAsync(1);

    const result = await downloadPromise;
    expect(result).not.toBeNull();
    expect(cloudStorageMock.readFile).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('throws CloudUnavailableError when iCloud is unavailable', async () => {
    cloudStorageMock.isCloudAvailable.mockResolvedValue(false);

    await expect(new ICloudProvider().download()).rejects.toBeInstanceOf(
      CloudUnavailableError,
    );
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('ICloudProvider.delete', () => {
  it('calls unlink when file exists', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.unlink.mockResolvedValue(undefined);

    await new ICloudProvider().delete();

    expect(cloudStorageMock.unlink).toHaveBeenCalledWith(
      DEFAULT_PATH,
      CloudStorageScope.AppData,
    );
  });

  it('is idempotent — does nothing when neither file nor .icloud placeholder exists', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(false);

    await new ICloudProvider().delete();

    expect(cloudStorageMock.unlink).not.toHaveBeenCalled();
  });

  it('calls unlink when only .icloud placeholder exists', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockImplementation((path: string) =>
      Promise.resolve(path === PLACEHOLDER_PATH),
    );
    cloudStorageMock.unlink.mockResolvedValue(undefined);

    await new ICloudProvider().delete();

    expect(cloudStorageMock.unlink).toHaveBeenCalledWith(
      DEFAULT_PATH,
      CloudStorageScope.AppData,
    );
  });

  it('throws CloudStorageError if unlink fails', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.unlink.mockRejectedValue(new Error('permission denied'));

    await expect(new ICloudProvider().delete()).rejects.toBeInstanceOf(
      CloudStorageError,
    );
  });

  it('throws CloudUnavailableError when iCloud is not available', async () => {
    cloudStorageMock.isCloudAvailable.mockResolvedValue(false);
    await expect(new ICloudProvider().delete()).rejects.toBeInstanceOf(
      CloudUnavailableError,
    );
  });
});

// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------

describe('ICloudProvider.isAvailable', () => {
  it('returns true when CloudStorage.isCloudAvailable resolves true', async () => {
    cloudStorageMock.isCloudAvailable.mockResolvedValue(true);
    await expect(new ICloudProvider().isAvailable()).resolves.toBe(true);
  });

  it('returns false when CloudStorage.isCloudAvailable resolves false', async () => {
    cloudStorageMock.isCloudAvailable.mockResolvedValue(false);
    await expect(new ICloudProvider().isAvailable()).resolves.toBe(false);
  });

  it('returns false (not throws) when CloudStorage.isCloudAvailable rejects', async () => {
    cloudStorageMock.isCloudAvailable.mockRejectedValue(new Error('native failure'));
    await expect(new ICloudProvider().isAvailable()).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// exists
// ---------------------------------------------------------------------------

describe('ICloudProvider.exists', () => {
  it('returns true when backup file exists', async () => {
    cloudStorageMock.isCloudAvailable.mockResolvedValue(true);
    cloudStorageMock.exists.mockResolvedValue(true);
    await expect(new ICloudProvider().exists()).resolves.toBe(true);
  });

  it('returns false when iCloud is unavailable', async () => {
    cloudStorageMock.isCloudAvailable.mockResolvedValue(false);
    await expect(new ICloudProvider().exists()).resolves.toBe(false);
  });

  it('returns true when only .icloud placeholder exists', async () => {
    cloudStorageMock.isCloudAvailable.mockResolvedValue(true);
    cloudStorageMock.exists.mockImplementation((path: string) =>
      Promise.resolve(path === PLACEHOLDER_PATH),
    );
    await expect(new ICloudProvider().exists()).resolves.toBe(true);
  });

  it('returns false when neither file nor .icloud placeholder exists', async () => {
    cloudStorageMock.isCloudAvailable.mockResolvedValue(true);
    cloudStorageMock.exists.mockResolvedValue(false);
    await expect(new ICloudProvider().exists()).resolves.toBe(false);
  });

  it('returns false on error', async () => {
    cloudStorageMock.isCloudAvailable.mockRejectedValue(new Error('crash'));
    await expect(new ICloudProvider().exists()).resolves.toBe(false);
  });
});
