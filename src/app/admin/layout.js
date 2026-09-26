import RoleGate from "../../components/RoleGate";
import { ROLES } from "../../lib/profile";

const ADMIN_ROLES = [ROLES.ADMIN];

// Admin mode — everything under /admin is admin-only.
export default function AdminLayout({ children }) {
  return <RoleGate roles={ADMIN_ROLES}>{children}</RoleGate>;
}
