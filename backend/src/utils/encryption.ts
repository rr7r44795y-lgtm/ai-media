import crypto from 'crypto';

const IV_LENGTH = 16;

const getKey = (): Buffer => {
  const key = process.env.AES_SECRET_KEY;
  if (!key || key.length !== 32) {
    throw new Error('AES_SECRET_KEY must be 32 characters');
  }
  return Buffer.from(key, 'utf-8');
};

export const encryptToken = (plain: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decryptToken = (payload: string): string => {
  const [ivHex, dataHex] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString('utf8');
};
