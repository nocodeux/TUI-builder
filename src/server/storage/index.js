import { localDriver } from './localDriver.js';
import { s3Driver } from './s3Driver.js';

export function getStorageDriver() {
  return (process.env.STORAGE_DRIVER || 'local') === 's3' ? s3Driver : localDriver;
}
