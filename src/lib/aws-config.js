import { Amplify } from "aws-amplify";

const region = process.env.NEXT_PUBLIC_AWS_REGION || "eu-west-2";
const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

if (!userPoolId || !userPoolClientId) {
  console.error("Cognito config missing — set NEXT_PUBLIC_COGNITO_USER_POOL_ID / NEXT_PUBLIC_COGNITO_CLIENT_ID in .env.local", {
    userPoolId,
    userPoolClientId,
  });
}

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      signUpVerificationMethod: "code",
      loginWith: {
        email: true,
        username: false,
        phone: false,
      },
    },
  },
});

export const AWS_REGION = region;
