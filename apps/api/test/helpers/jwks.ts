/**
 * テスト用: ローカル生成した鍵ペアでApple/Google IDトークンを模したJWTを発行し、
 * `createLocalJWKSet` でJWKS取得元を作るヘルパー(M3)。
 *
 * 本番では `createRemoteJWKSet` でApple/GoogleのJWKSエンドポイントから取得するが、
 * テストでは外部ネットワークに出られないため、ここで作るローカルJWKSを
 * `verifyAppleIdentityToken` / `verifyGoogleIdToken` の `getJwks` 引数に注入する。
 */

import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";

const KID = "test-kid-1";

export interface TestIdTokenKeySet {
  /** verifyXxxIdToken に注入するJWKS取得元 */
  jwks: JWTVerifyGetKey;
  /** テスト用IDトークンを発行する */
  signIdToken: (claims: {
    sub: string;
    email?: string;
    issuer: string;
    audience: string;
    expired?: boolean;
  }) => Promise<string>;
}

/** RSA鍵ペアを生成し、ローカルJWKS + IDトークン署名関数を返す。 */
export async function createTestIdTokenKeySet(): Promise<TestIdTokenKeySet> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = "RS256";

  const jwks = createLocalJWKSet({ keys: [publicJwk] });

  const signIdToken: TestIdTokenKeySet["signIdToken"] = async ({
    sub,
    email,
    issuer,
    audience,
    expired,
  }) => {
    let builder = new SignJWT({ email })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setSubject(sub)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt();

    builder = expired
      ? builder.setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      : builder.setExpirationTime("1h");

    return await builder.sign(privateKey);
  };

  return { jwks, signIdToken };
}
