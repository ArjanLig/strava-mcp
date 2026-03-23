import { Redis } from "@upstash/redis";
import { encrypt, decrypt } from "./crypto";

const redis = new Redis({
  url: (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)!,
  token: (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)!,
});

export interface UserTokens {
  stravaAccessToken: string;
  stravaRefreshToken: string;
  stravaExpiresAt: number;
}

export async function saveUserTokens(userId: string, tokens: UserTokens): Promise<void> {
  const encrypted = encrypt(JSON.stringify(tokens));
  await redis.set(`user:${userId}`, encrypted);
}

export async function getUserTokens(userId: string): Promise<UserTokens | null> {
  const data = await redis.get<string>(`user:${userId}`);
  if (!data) return null;
  return JSON.parse(decrypt(data));
}

export async function deleteUserTokens(userId: string): Promise<void> {
  await redis.del(`user:${userId}`);
}

export async function saveOAuthState(state: string, data: { userId: string; clientId: string; redirectUri: string; codeChallenge: string }): Promise<void> {
  await redis.set(`oauth_state:${state}`, JSON.stringify(data), { ex: 600 });
}

export async function getOAuthState(state: string): Promise<{ userId: string; clientId: string; redirectUri: string; codeChallenge: string } | null> {
  const data = await redis.get<string>(`oauth_state:${state}`);
  if (!data) return null;
  await redis.del(`oauth_state:${state}`);
  return typeof data === "string" ? JSON.parse(data) : data;
}

export async function peekOAuthState(state: string): Promise<{ userId: string; clientId: string; redirectUri: string; codeChallenge: string } | null> {
  const data = await redis.get<string>(`oauth_state:${state}`);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}

export async function saveAuthCode(code: string, data: { userId: string; clientId: string; codeChallenge: string }): Promise<void> {
  await redis.set(`auth_code:${code}`, JSON.stringify(data), { ex: 300 });
}

export async function getAuthCode(code: string): Promise<{ userId: string; clientId: string; codeChallenge: string } | null> {
  const data = await redis.get<string>(`auth_code:${code}`);
  if (!data) return null;
  await redis.del(`auth_code:${code}`);
  return typeof data === "string" ? JSON.parse(data) : data;
}

export interface UserStravaApp {
  stravaClientId: string;
  stravaClientSecret: string;
}

export async function saveUserStravaApp(userId: string, app: UserStravaApp): Promise<void> {
  const encrypted = encrypt(JSON.stringify(app));
  await redis.set(`user_strava_app:${userId}`, encrypted);
}

export async function getUserStravaApp(userId: string): Promise<UserStravaApp | null> {
  const data = await redis.get<string>(`user_strava_app:${userId}`);
  if (!data) return null;
  return JSON.parse(decrypt(data));
}

export async function saveClient(clientId: string, data: { clientSecret: string; redirectUris: string[] }): Promise<void> {
  await redis.set(`client:${clientId}`, JSON.stringify(data));
}

export async function getClient(clientId: string): Promise<{ clientSecret: string; redirectUris: string[] } | null> {
  const data = await redis.get<string>(`client:${clientId}`);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}
