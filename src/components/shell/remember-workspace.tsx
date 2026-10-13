"use client";
import { useEffect } from "react";
import { rememberWorkspaceAction } from "@/actions/tenancy";

/** Records the last-opened workspace so /app can return the user to it. */
export function RememberWorkspace({ workspaceId }: { workspaceId: string }) {
  useEffect(() => {
    void rememberWorkspaceAction(workspaceId);
  }, [workspaceId]);
  return null;
}
