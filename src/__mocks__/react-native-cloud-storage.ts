/**
 * Manual mock for `react-native-cloud-storage`.
 * Provides Jest mock functions for every method used by both providers.
 */

export enum CloudStorageScope {
  Documents = 'documents',
  AppData = 'app_data',
}

export const CloudStorage = {
  isCloudAvailable: jest.fn<Promise<boolean>, []>(),
  isAvailable: jest.fn<Promise<boolean>, []>(),
  writeFile: jest.fn<Promise<void>, [string, string, CloudStorageScope?]>(),
  readFile: jest.fn<Promise<string>, [string, CloudStorageScope?]>(),
  exists: jest.fn<Promise<boolean>, [string, CloudStorageScope?]>(),
  unlink: jest.fn<Promise<void>, [string, CloudStorageScope?]>(),
  triggerSync: jest.fn<Promise<void>, [string, CloudStorageScope?]>(),
  readdir: jest.fn<Promise<string[]>, [string, CloudStorageScope?]>(),
  stat: jest.fn<Promise<Record<string, unknown>>, [string, CloudStorageScope?]>(),
  setProviderOptions: jest.fn<void, [Record<string, unknown>]>(),
};
