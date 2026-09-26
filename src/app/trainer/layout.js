import RoleGate from "../../components/RoleGate";
import { ROLES } from "../../lib/profile";

const TRAINER_ROLES = [ROLES.PT, ROLES.ADMIN];

// Trainer mode — PTs and admins only.
export default function TrainerLayout({ children }) {
  return <RoleGate roles={TRAINER_ROLES}>{children}</RoleGate>;
}
