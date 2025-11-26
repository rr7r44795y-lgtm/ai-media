import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';

dotenv.config();

const key = process.env.AES_ENCRYPTION_KEY;
if (!key) {
  throw new Error('AES_ENCRYPTION_KEY missing');
}

export function encryptToken(value: string): string {
  return CryptoJS.AES.encrypt(value, key).toString();
}

export function decryptToken(encrypted: string): string {
  const bytes = CryptoJS.AES.decrypt(encrypted, key);
  return bytes.toString(CryptoJS.enc.Utf8);
}
