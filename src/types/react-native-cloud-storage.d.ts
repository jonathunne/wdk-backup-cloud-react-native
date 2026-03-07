/**
 * Ambient type declarations for react-native-cloud-storage.
 * Provides the subset of the API used by our providers.
 * This resolves types at build time when the peer dep isn't installed locally.
 */

declare module 'react-native-cloud-storage' {
  export enum CloudStorageScope {
    Documents = 'documents',
    AppData = 'app_data',
  }

  export const CloudStorage: {
    isCloudAvailable(): Promise<boolean>;
    /** @deprecated — older API name */
    isAvailable(): Promise<boolean>;
    writeFile(path: string, data: string, scope?: CloudStorageScope): Promise<void>;
    readFile(path: string, scope?: CloudStorageScope): Promise<string>;
    exists(path: string, scope?: CloudStorageScope): Promise<boolean>;
    unlink(path: string, scope?: CloudStorageScope): Promise<void>;
    setProviderOptions(options: Record<string, unknown>): void;
  };
}
