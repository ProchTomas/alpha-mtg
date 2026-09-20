import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function fromAlphabet(alphabet: string, len: number): string {
  const bytes = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[bytes[i]! % alphabet.length];
  return s;
}

export const newId = (): string => fromAlphabet(ALPHABET, 16);
export const newSessionId = (): string => randomBytes(32).toString("base64url");
export const newJoinCode = (): string => fromAlphabet(CODE_ALPHABET, 6);
/** Recovery code shown once at registration, e.g. "K7QX-M3NP-W9RT-2ABC-DEFG-HJKL". */
export function newRecoveryCode(): string {
  return Array.from({ length: 6 }, () => fromAlphabet(CODE_ALPHABET, 4)).join("-");
}
