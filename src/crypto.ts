import type { Post } from "./types";

type Secret = NonNullable<Post["secret"]>;
const rounds = 210000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: rounds, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptBody(body: string, password: string): Promise<Secret> {
  if (password.length < 8) throw new Error("文章密码至少需要 8 个字符");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(body));
  return { version: 1, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

export async function decryptBody(secret: Secret, password: string): Promise<string> {
  if (secret.version !== 1) throw new Error("文章加密版本暂不支持");
  try {
    const key = await derive(password, fromBase64(secret.salt));
    const body = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(secret.iv) }, key, fromBase64(secret.data));
    return new TextDecoder().decode(body);
  } catch { throw new Error("密码不正确，或文章数据已损坏"); }
}
