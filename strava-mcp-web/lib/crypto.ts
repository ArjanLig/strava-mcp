import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { SignJWT, jwtVerify } from "jose";

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, "hex");
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(data: string): string {
  const [ivHex, tagHex, ciphertextHex] = data.split(":");
  const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]).toString("utf8");
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(JWT_SECRET);
}

export async function verifyAccessToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload.sub!;
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, type: "refresh" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(JWT_SECRET);
}
