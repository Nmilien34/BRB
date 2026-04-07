import { HttpError } from './httpError.js';

export function normalizeUsPhoneNumber(phone: string): string {
  const trimmedPhone = phone.trim();
  const digits = trimmedPhone.replace(/\D/g, '');

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  throw new HttpError(400, 'Phone number must be a valid US number.');
}
