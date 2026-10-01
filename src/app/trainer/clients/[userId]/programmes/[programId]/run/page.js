"use client";

import { useParams } from "next/navigation";
import ProgrammeDetail from "../../../../../../../components/ProgrammeDetail";
import { useClient } from "../../../../../useClient";

// Running a trainer-led programme with this client.
export default function RunProgrammePage() {
  const { userId } = useParams();
  const { client } = useClient(userId);
  return <ProgrammeDetail clientName={client?.name || client?.email} />;
}
