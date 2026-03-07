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
    cloudStorageMock.readFile.mockResolvedValue(JSON.stringify(VALID_PAYLOAD));

    const result = await new ICloudProvider().download();
    expect(result).not.toBeNull();
    expect(result!.encryptionKey).toBe(ENCRYPTED_KEY);
    expect(result!.version).toBe(1);
  });

  it('returns null when no backup file exists', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(false);

    const result = await new ICloudProvider().download();
    expect(result).toBeNull();
    expect(cloudStorageMock.readFile).not.toHaveBeenCalled();
  });

  it('throws CloudStorageError on invalid JSON in file', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.readFile.mockResolvedValue('not json {{');

    await expect(new ICloudProvider().download()).rejects.toBeInstanceOf(
      CloudStorageError,
    );
  });

  it('throws CloudStorageError on payload with wrong shape', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.readFile.mockResolvedValue(JSON.stringify({ version: 2 }));

    await expect(new ICloudProvider().download()).rejects.toBeInstanceOf(
      CloudStorageError,
    );
  });

  it('throws CloudAuthError when user not signed in during read', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.readFile.mockRejectedValue(new Error('no account'));

    await expect(new ICloudProvider().download()).rejects.toBeInstanceOf(
      CloudAuthError,
    );
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

  it('is idempotent — does nothing when file does not exist', async () => {
    makeAvailable();
    cloudStorageMock.exists.mockResolvedValue(false);

    await new ICloudProvider().delete();

    expect(cloudStorageMock.unlink).not.toHaveBeenCalled();
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

  it('returns false when file does not exist', async () => {
    cloudStorageMock.isCloudAvailable.mockResolvedValue(true);
    cloudStorageMock.exists.mockResolvedValue(false);
    await expect(new ICloudProvider().exists()).resolves.toBe(false);
  });

  it('returns false on error', async () => {
    cloudStorageMock.isCloudAvailable.mockRejectedValue(new Error('crash'));
    await expect(new ICloudProvider().exists()).resolves.toBe(false);
  });
});
