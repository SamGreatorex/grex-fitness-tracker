// Mirrors the Cognito User Pool's PasswordPolicy in aws/template.yml —
// keep the two in step. Checked client-side so users see what's missing
// before Cognito rejects it.
export const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "number", label: "A number", test: (p) => /\d/.test(p) },
];

export function meetsPasswordRules(password) {
  return PASSWORD_RULES.every((r) => r.test(password));
}

// Friendlier messages for the Cognito errors password flows can hit.
export function passwordErrorMessage(err, fallback) {
  switch (err?.name) {
    case "NotAuthorizedException":
      return "Your current password is incorrect.";
    case "InvalidPasswordException":
      return "That password doesn't meet the requirements.";
    case "CodeMismatchException":
      return "That code isn't right — check the email and try again.";
    case "ExpiredCodeException":
      return "That code has expired. Request a new one.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many attempts. Please wait a few minutes and try again.";
    default:
      return err?.message || fallback;
  }
}
