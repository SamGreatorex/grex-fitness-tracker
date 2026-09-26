// Shared by the client and the API routes — no server-only imports here.

// Everyone signs up as BASIC. Promote someone by editing the `role`
// attribute on their row in the users table; the app never changes it.
export const ROLES = {
  BASIC: "basic",
  PT: "pt",
  ADMIN: "admin",
};

export const ROLE_LABELS = {
  [ROLES.BASIC]: "Basic",
  [ROLES.PT]: "PT",
  [ROLES.ADMIN]: "Admin",
};

// Modes are the app's top-level areas, switched from the header dropdown.
// Which ones a user can enter depends on their role. The current mode is
// derived from the URL, so each mode is just a section of the site.
export const MODES = {
  USER: "user",
  TRAINER: "trainer",
  ADMIN: "admin",
};

export const MODE_LABELS = {
  [MODES.USER]: "User",
  [MODES.TRAINER]: "Trainer",
  [MODES.ADMIN]: "Admin",
};

export const MODE_HOME = {
  [MODES.USER]: "/",
  [MODES.TRAINER]: "/trainer",
  [MODES.ADMIN]: "/admin",
};

const MODES_BY_ROLE = {
  [ROLES.BASIC]: [MODES.USER],
  [ROLES.PT]: [MODES.USER, MODES.TRAINER],
  [ROLES.ADMIN]: [MODES.USER, MODES.TRAINER, MODES.ADMIN],
};

export function modesForRole(role) {
  return MODES_BY_ROLE[role] ?? [MODES.USER];
}

export function modeForPath(pathname) {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return MODES.ADMIN;
  if (pathname === "/trainer" || pathname.startsWith("/trainer/")) return MODES.TRAINER;
  return MODES.USER;
}

// Profile fields the user can edit themselves. To add a field later, add
// it here (and to ProfileForm) — the users table is schemaless, so no
// infrastructure change is needed. `required` fields must be filled in
// before the profile setup window stops appearing.
export const PROFILE_FIELDS = {
  name: { type: "string", required: true, maxLength: 100 },
  address: { type: "string", required: true, maxLength: 500 },
  heightCm: { type: "number", required: true, min: 50, max: 272 },
  weightKg: { type: "number", required: true, min: 20, max: 400 },
  // Display/entry preference only — heightCm/weightKg are always metric.
  heightUnit: { type: "enum", required: false, values: ["cm", "ftin"] },
  weightUnit: { type: "enum", required: false, values: ["kg", "stlb"] },
};

export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export function isProfileComplete(profile) {
  if (!profile) return false;
  return Object.entries(PROFILE_FIELDS).every(([key, def]) => {
    if (!def.required) return true;
    const value = profile[key];
    return value !== undefined && value !== null && value !== "";
  });
}
