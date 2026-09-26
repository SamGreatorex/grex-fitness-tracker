import { CognitoJwtVerifier } from "aws-jwt-verify";

let verifier = null;

function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
      tokenUse: "id",
      clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
    });
  }
  return verifier;
}

// Verifies the Cognito ID token on the Authorization header and returns its
// payload (sub, email, name, ...). Returns null if missing/invalid.
export async function getUserClaims(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  try {
    return await getVerifier().verify(token);
  } catch {
    return null;
  }
}

// Same as getUserClaims, but just the user's sub (userId).
export async function getUserId(request) {
  const claims = await getUserClaims(request);
  return claims?.sub ?? null;
}
