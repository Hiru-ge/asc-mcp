/**
 * App Store Connect API 用の JWT 生成・キャッシュ。
 *
 * 仕様: https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests
 * - アルゴリズム: ES256
 * - ヘッダ: kid (Key ID)
 * - ペイロード: iss (Issuer ID), iat, exp (発行から20分以内), aud: "appstoreconnect-v1"
 */
import { readFile } from "node:fs/promises";
import { importPKCS8, SignJWT, type CryptoKey } from "jose";

const TOKEN_TTL_SECONDS = 19 * 60; // 上限20分のため19分で発行
const REFRESH_MARGIN_SECONDS = 2 * 60; // 残り2分を切ったら再生成

export interface AscCredentials {
  keyId: string;
  issuerId: string;
  privateKeyPath: string;
  vendorNumber?: string;
}

export class MissingEnvVarsError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      `App Store Connect APIの認証情報が不足しています。以下の環境変数を設定してください: ${missing.join(", ")}`
    );
    this.name = "MissingEnvVarsError";
  }
}

/** 必須環境変数を検証し、揃っていれば資格情報を返す。欠けていれば MissingEnvVarsError を投げる。 */
export function loadCredentials(): AscCredentials {
  const keyId = process.env.ASC_KEY_ID;
  const issuerId = process.env.ASC_ISSUER_ID;
  const privateKeyPath = process.env.ASC_PRIVATE_KEY_PATH;

  const missing: string[] = [];
  if (!keyId) missing.push("ASC_KEY_ID");
  if (!issuerId) missing.push("ASC_ISSUER_ID");
  if (!privateKeyPath) missing.push("ASC_PRIVATE_KEY_PATH");

  if (missing.length > 0) {
    throw new MissingEnvVarsError(missing);
  }

  return {
    keyId: keyId!,
    issuerId: issuerId!,
    privateKeyPath: privateKeyPath!,
    vendorNumber: process.env.ASC_VENDOR_NUMBER,
  };
}

/** ASC_VENDOR_NUMBER を検証して返す。未設定なら MissingEnvVarsError を投げる。 */
export function requireVendorNumber(): string {
  const vendorNumber = process.env.ASC_VENDOR_NUMBER;
  if (!vendorNumber) {
    throw new MissingEnvVarsError(["ASC_VENDOR_NUMBER"]);
  }
  return vendorNumber;
}

let cachedPrivateKey: CryptoKey | undefined;
let cachedPrivateKeyPath: string | undefined;

async function getPrivateKey(privateKeyPath: string): Promise<CryptoKey> {
  if (cachedPrivateKey && cachedPrivateKeyPath === privateKeyPath) {
    return cachedPrivateKey;
  }
  const pem = await readFile(privateKeyPath, "utf8");
  const key = await importPKCS8(pem, "ES256");
  cachedPrivateKey = key;
  cachedPrivateKeyPath = privateKeyPath;
  return key;
}

interface CachedToken {
  token: string;
  expiresAtSeconds: number;
}

let cachedToken: CachedToken | undefined;

/** キャッシュされたJWTを返す。残り2分を切っている・未生成の場合は新規生成する。 */
export async function getAccessToken(): Promise<string> {
  const credentials = loadCredentials();
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (cachedToken && cachedToken.expiresAtSeconds - nowSeconds > REFRESH_MARGIN_SECONDS) {
    return cachedToken.token;
  }

  const privateKey = await getPrivateKey(credentials.privateKeyPath);
  const iat = nowSeconds;
  const exp = iat + TOKEN_TTL_SECONDS;

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: credentials.keyId, typ: "JWT" })
    .setIssuer(credentials.issuerId)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .setAudience("appstoreconnect-v1")
    .sign(privateKey);

  cachedToken = { token, expiresAtSeconds: exp };
  return token;
}
