import { CloudStorage, CloudStorageScope } from 'react-native-cloud-storage';
import { GoogleDriveProvider } from '../providers/googleDriveProvider';
import {
  CloudAuthError,
  CloudStorageError,
  CloudUnavailableError,
} from '../errors';
import type { CloudEncryptionKeyFile } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCESS_TOKEN = 'test_access_token';
const ENCRYPTED_KEY = 'encrypted_master_key_hex';
const DEFAULT_PATH = 'wallet_backup_key.json';
const METADATA = { version: 1 };

const VALID_PAYLOAD: CloudEncryptionKeyFile = {
  encryptionKey: ENCRYPTED_KEY,
  savedAt: '2026-02-25T00:00:00.000Z',
  platform: 'android',
  version: 1,
  cloudEmail: '',
};

const cloudStorageMock = CloudStorage as jest.Mocked<typeof CloudStorage>;

function makeProvider(config?: { filePath?: string; cloudEmail?: string }): GoogleDriveProvider {
  return new GoogleDriveProvider({ accessToken: ACCESS_TOKEN, ...config });
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('GoogleDriveProvider — constructor', () => {
  it('sets provider options with access token and default timeout', () => {
    makeProvider();
    expect(cloudStorageMock.setProviderOptions).toHaveBeenCalledWith({
      accessToken: ACCESS_TOKEN,
      timeout: 30_000,
    });
  });
});

// ---------------------------------------------------------------------------
// upload
// ---------------------------------------------------------------------------

describe('GoogleDriveProvider.upload', () => {
  it('writes CloudEncryptionKeyFile JSON to the default path', async () => {
    cloudStorageMock.writeFile.mockResolvedValue(undefined);
    cloudStorageMock.exists.mockResolvedValue(true);

    await makeProvider().upload(ENCRYPTED_KEY, METADATA);

    expect(cloudStorageMock.writeFile).toHaveBeenCalledTimes(1);
    const [path, content, scope] = cloudStorageMock.writeFile.mock.calls[0]!;
    expect(path).toBe(DEFAULT_PATH);
    expect(scope).toBe(CloudStorageScope.AppData);

    const parsed = JSON.parse(content) as CloudEncryptionKeyFile;
    expect(parsed.encryptionKey).toBe(ENCRYPTED_KEY);
    expect(parsed.platform).toBe('android');
    expect(parsed.version).toBe(1);
    expect(typeof parsed.savedAt).toBe('string');
  });

  it('writes to custom path when configured', async () => {
    cloudStorageMock.writeFile.mockResolvedValue(undefined);
    cloudStorageMock.exists.mockResolvedValue(true);

    await makeProvider({ filePath: 'custom/backup.json' }).upload(ENCRYPTED_KEY, METADATA);

    expect(cloudStorageMock.writeFile.mock.calls[0]![0]).toBe('custom/backup.json');
  });

  it('verifies file existence after write', async () => {
    cloudStorageMock.writeFile.mockResolvedValue(undefined);
    cloudStorageMock.exists.mockResolvedValue(true);

    await makeProvider().upload(ENCRYPTED_KEY, METADATA);

    expect(cloudStorageMock.exists).toHaveBeenCalledWith(
      DEFAULT_PATH,
      CloudStorageScope.AppData,
    );
  });

  it('throws CloudStorageError when file not found after write', async () => {
    cloudStorageMock.writeFile.mockResolvedValue(undefined);
    cloudStorageMock.exists.mockResolvedValue(false);

    await expect(
      makeProvider().upload(ENCRYPTED_KEY, METADATA),
    ).rejects.toBeInstanceOf(CloudStorageError);
  });

  it('throws CloudAuthError on auth failure during write', async () => {
    cloudStorageMock.writeFile.mockRejectedValue(new Error('unauthorized 401'));

    await expect(
      makeProvider().upload(ENCRYPTED_KEY, METADATA),
    ).rejects.toBeInstanceOf(CloudAuthError);
  });

  it('throws CloudUnavailableError on network failure', async () => {
    cloudStorageMock.writeFile.mockRejectedValue(new Error('network unavailable'));

    await expect(
      makeProvider().upload(ENCRYPTED_KEY, METADATA),
    ).rejects.toBeInstanceOf(CloudUnavailableError);
  });

  it('throws CloudStorageError on generic write failure', async () => {
    cloudStorageMock.writeFile.mockRejectedValue(new Error('I/O error'));

    await expect(
      makeProvider().upload(ENCRYPTED_KEY, METADATA),
    ).rejects.toBeInstanceOf(CloudStorageError);
  });

  it('returns the written payload on success', async () => {
    cloudStorageMock.writeFile.mockResolvedValue(undefined);
    cloudStorageMock.exists.mockResolvedValue(true);

    const result = await makeProvider().upload(ENCRYPTED_KEY, METADATA);
    expect(result).not.toBeNull();
    expect(result!.encryptionKey).toBe(ENCRYPTED_KEY);
    expect(result!.platform).toBe('android');
  });

  it('includes cloudEmail from config', async () => {
    cloudStorageMock.writeFile.mockResolvedValue(undefined);
    cloudStorageMock.exists.mockResolvedValue(true);

    await makeProvider({ cloudEmail: 'user@example.com' }).upload(ENCRYPTED_KEY, METADATA);

    const content = cloudStorageMock.writeFile.mock.calls[0]![1];
    const parsed = JSON.parse(content) as CloudEncryptionKeyFile;
    expect(parsed.cloudEmail).toBe('user@example.com');
  });
});

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------

describe('GoogleDriveProvider.download', () => {
  it('returns CloudEncryptionKeyFile when file exists', async () => {
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.readFile.mockResolvedValue(JSON.stringify(VALID_PAYLOAD));

    const result = await makeProvider().download();
    expect(result).not.toBeNull();
    expect(result!.encryptionKey).toBe(ENCRYPTED_KEY);
    expect(result!.version).toBe(1);
  });

  it('returns null when no file exists', async () => {
    cloudStorageMock.exists.mockResolvedValue(false);

    const result = await makeProvider().download();
    expect(result).toBeNull();
    expect(cloudStorageMock.readFile).not.toHaveBeenCalled();
  });

  it('returns null when "Could not get file id" error during exists check', async () => {
    cloudStorageMock.exists.mockRejectedValue(new Error('Could not get file id'));

    const result = await makeProvider().download();
    expect(result).toBeNull();
  });

  it('throws CloudStorageError when downloaded payload has wrong shape', async () => {
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.readFile.mockResolvedValue(JSON.stringify({ version: 2, bad: 'data' }));

    await expect(makeProvider().download()).rejects.toBeInstanceOf(
      CloudStorageError,
    );
  });

  it('throws CloudStorageError on invalid JSON', async () => {
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.readFile.mockResolvedValue('not json {{');

    await expect(makeProvider().download()).rejects.toBeInstanceOf(
      CloudStorageError,
    );
  });

  it('throws CloudAuthError on auth failure during read', async () => {
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.readFile.mockRejectedValue(new Error('unauthorized 401'));

    await expect(makeProvider().download()).rejects.toBeInstanceOf(
      CloudAuthError,
    );
  });

  it('throws CloudUnavailableError on network failure during download', async () => {
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.readFile.mockRejectedValue(new Error('network unavailable'));

    await expect(makeProvider().download()).rejects.toBeInstanceOf(
      CloudUnavailableError,
    );
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('GoogleDriveProvider.delete', () => {
  it('calls unlink on existing file', async () => {
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.unlink.mockResolvedValue(undefined);

    await makeProvider().delete();

    expect(cloudStorageMock.unlink).toHaveBeenCalledWith(
      DEFAULT_PATH,
      CloudStorageScope.AppData,
    );
  });

  it('is idempotent — does nothing when no file exists', async () => {
    cloudStorageMock.exists.mockResolvedValue(false);

    await expect(makeProvider().delete()).resolves.toBeUndefined();
    expect(cloudStorageMock.unlink).not.toHaveBeenCalled();
  });

  it('handles "Could not get file id" gracefully during exists check', async () => {
    cloudStorageMock.exists.mockRejectedValue(new Error('Could not get file id'));

    await expect(makeProvider().delete()).resolves.toBeUndefined();
  });

  it('throws CloudAuthError on auth failure during delete', async () => {
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.unlink.mockRejectedValue(new Error('unauthorized 403'));

    await expect(makeProvider().delete()).rejects.toBeInstanceOf(
      CloudAuthError,
    );
  });

  it('throws CloudStorageError when delete fails', async () => {
    cloudStorageMock.exists.mockResolvedValue(true);
    cloudStorageMock.unlink.mockRejectedValue(new Error('server error'));

    await expect(makeProvider().delete()).rejects.toBeInstanceOf(
      CloudStorageError,
    );
  });
});

// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------

describe('GoogleDriveProvider.isAvailable', () => {
  it('returns true when CloudStorage.isCloudAvailable resolves true', async () => {
    cloudStorageMock.isCloudAvailable.mockResolvedValue(true);
    await expect(makeProvider().isAvailable()).resolves.toBe(true);
  });

  it('returns false on error', async () => {
    cloudStorageMock.isCloudAvailable.mockRejectedValue(new TypeError('offline'));
    await expect(makeProvider().isAvailable()).resolves.toBe(false);
  });

  it('returns false when isCloudAvailable returns false', async () => {
    cloudStorageMock.isCloudAvailable.mockResolvedValue(false);
    await expect(makeProvider().isAvailable()).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// exists
// ---------------------------------------------------------------------------

describe('GoogleDriveProvider.exists', () => {
  it('returns true when file exists', async () => {
    cloudStorageMock.exists.mockResolvedValue(true);
    await expect(makeProvider().exists()).resolves.toBe(true);
  });

  it('returns false when file does not exist', async () => {
    cloudStorageMock.exists.mockResolvedValue(false);
    await expect(makeProvider().exists()).resolves.toBe(false);
  });

  it('returns false on "Could not get file id" error', async () => {
    cloudStorageMock.exists.mockRejectedValue(new Error('Could not get file id'));
    await expect(makeProvider().exists()).resolves.toBe(false);
  });

  it('returns false on any error', async () => {
    cloudStorageMock.exists.mockRejectedValue(new Error('unknown'));
    await expect(makeProvider().exists()).resolves.toBe(false);
  });
});
