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

// Verifies the Cognito ID token on the Authorization header and returns the
// user's sub (userId). Returns null if missing/invalid.
export async function getUserId(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  try {
    const payload = await getVerifier().verify(token);
    return payload.sub;
  } catch {
    return null;
  }
}
