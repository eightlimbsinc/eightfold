"use server";
/**
 * CRM Server Actions. Each action re-authenticates, resolves the workspace
 * context (authorization), delegates to the service layer, and revalidates
 * affected pages. Arguments bound on the client are treated as untrusted.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { formToObject, runAction, type ActionResult } from "@/server/action-result";
import { actionWorkspaceContext } from "@/server/request";
import {
  addTagToContact,
  createContact,
  deleteContact,
  removeTagFromContact,
  setContactArchived,
  updateContact,
} from "@/server/services/contacts";
import { createNote, deleteNote } from "@/server/services/notes";
import { createTask, deleteTask, setTaskCompleted, updateTask } from "@/server/services/tasks";
import {
  createOpportunity,
  deleteOpportunity,
  moveOpportunityStage,
  setOpportunityArchived,
  setOpportunityStatus,
  updateOpportunity,
} from "@/server/services/opportunities";
import { createPipeline, deletePipeline, updatePipeline } from "@/server/services/pipelines";
import { createFieldDefinition, setFieldDefinitionArchived, updateFieldDefinition } from "@/server/services/custom-fields";
import { createTag, deleteTag, updateTag } from "@/server/services/tags";

type R = ActionResult<unknown>;
const ws = (id: string) => `/w/${id}`;

// ---- Contacts -------------------------------------------------------------

export async function createContactAction(workspaceId: string, _prev: R, formData: FormData): Promise<R> {
  let id: string | undefined;
  const result = await runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    id = (await createContact(ctx, formToObject(formData, ["tagIds"]))).id;
    revalidatePath(ws(workspaceId), "layout");
  });
  if (!result.ok || !id) return result;
  redirect(`${ws(workspaceId)}/contacts/${id}?created=1`);
}

export async function updateContactAction(workspaceId: string, contactId: string, _prev: R, formData: FormData): Promise<R> {
  const result = await runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await updateContact(ctx, contactId, formToObject(formData, ["tagIds"]));
    revalidatePath(ws(workspaceId), "layout");
  });
  if (!result.ok) return result;
  redirect(`${ws(workspaceId)}/contacts/${contactId}`);
}

export async function setContactArchivedAction(workspaceId: string, contactId: string, archived: boolean): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await setContactArchived(ctx, contactId, archived);
    revalidatePath(ws(workspaceId), "layout");
  }, archived ? "Contact archived." : "Contact restored.");
}

export async function deleteContactAction(workspaceId: string, contactId: string): Promise<R> {
  const result = await runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await deleteContact(ctx, contactId);
    revalidatePath(ws(workspaceId), "layout");
  });
  if (!result.ok) return result;
  redirect(`${ws(workspaceId)}/contacts?archived=1&deleted=1`);
}

export async function addTagAction(workspaceId: string, contactId: string, tag: { tagId?: string; name?: string }): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await addTagToContact(ctx, contactId, tag);
    revalidatePath(`${ws(workspaceId)}/contacts/${contactId}`);
  });
}

export async function removeTagAction(workspaceId: string, contactId: string, tagId: string): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await removeTagFromContact(ctx, contactId, tagId);
    revalidatePath(`${ws(workspaceId)}/contacts/${contactId}`);
  });
}

// ---- Notes ----------------------------------------------------------------

export async function createNoteAction(workspaceId: string, _prev: R, formData: FormData): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await createNote(ctx, formToObject(formData));
    revalidatePath(ws(workspaceId), "layout");
  }, "Note added.");
}

export async function deleteNoteAction(workspaceId: string, noteId: string): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await deleteNote(ctx, noteId);
    revalidatePath(ws(workspaceId), "layout");
  });
}

// ---- Tasks ----------------------------------------------------------------

export async function saveTaskAction(workspaceId: string, taskId: string | null, _prev: R, formData: FormData): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    const input = formToObject(formData);
    // <input type="datetime-local"> has no zone: interpret it in the browser's offset sent alongside.
    if (typeof input.dueAt === "string" && input.dueAt && typeof input.tzOffset === "string") {
      const offset = Number(input.tzOffset);
      if (Number.isFinite(offset)) {
        const local = new Date(`${input.dueAt}:00Z`);
        if (!Number.isNaN(local.getTime())) input.dueAt = new Date(local.getTime() + offset * 60_000).toISOString();
      }
    }
    if (taskId) await updateTask(ctx, taskId, input);
    else await createTask(ctx, input);
    revalidatePath(ws(workspaceId), "layout");
  }, taskId ? "Task updated." : "Task created.");
}

export async function setTaskCompletedAction(workspaceId: string, taskId: string, completed: boolean): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await setTaskCompleted(ctx, taskId, completed);
    revalidatePath(ws(workspaceId), "layout");
  });
}

export async function deleteTaskAction(workspaceId: string, taskId: string): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await deleteTask(ctx, taskId);
    revalidatePath(ws(workspaceId), "layout");
  }, "Task deleted.");
}

// ---- Opportunities ----------------------------------------------------------

export async function createOpportunityAction(workspaceId: string, _prev: R, formData: FormData): Promise<R> {
  let id: string | undefined;
  const result = await runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    id = (await createOpportunity(ctx, formToObject(formData))).id;
    revalidatePath(ws(workspaceId), "layout");
  });
  if (!result.ok || !id) return result;
  redirect(`${ws(workspaceId)}/opportunities/${id}?created=1`);
}

export async function updateOpportunityAction(workspaceId: string, opportunityId: string, _prev: R, formData: FormData): Promise<R> {
  const result = await runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await updateOpportunity(ctx, opportunityId, formToObject(formData));
    revalidatePath(ws(workspaceId), "layout");
  });
  if (!result.ok) return result;
  redirect(`${ws(workspaceId)}/opportunities/${opportunityId}`);
}

export async function moveOpportunityAction(workspaceId: string, opportunityId: string, stageId: string): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await moveOpportunityStage(ctx, { opportunityId, stageId });
    revalidatePath(ws(workspaceId), "layout");
  });
}

export async function setOpportunityStatusAction(workspaceId: string, opportunityId: string, status: "OPEN" | "WON" | "LOST"): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    if (!["OPEN", "WON", "LOST"].includes(status)) throw new Error("Invalid status");
    await setOpportunityStatus(ctx, opportunityId, status);
    revalidatePath(ws(workspaceId), "layout");
  }, `Marked as ${status.toLowerCase()}.`);
}

export async function setOpportunityArchivedAction(workspaceId: string, opportunityId: string, archived: boolean): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await setOpportunityArchived(ctx, opportunityId, archived);
    revalidatePath(ws(workspaceId), "layout");
  }, archived ? "Opportunity archived." : "Opportunity restored.");
}

export async function deleteOpportunityAction(workspaceId: string, opportunityId: string, pipelineId: string): Promise<R> {
  const result = await runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await deleteOpportunity(ctx, opportunityId);
    revalidatePath(ws(workspaceId), "layout");
  });
  if (!result.ok) return result;
  redirect(`${ws(workspaceId)}/pipelines/${encodeURIComponent(pipelineId)}`);
}

// ---- Pipelines ------------------------------------------------------------

function pipelineFromForm(formData: FormData) {
  const ids = formData.getAll("stageId").map(String);
  const names = formData.getAll("stageName").map(String);
  const probabilities = formData.getAll("stageProbability").map(String);
  return {
    name: formData.get("name"),
    stages: names.map((name, i) => ({ id: ids[i] || undefined, name, probability: probabilities[i] })),
  };
}

export async function savePipelineAction(workspaceId: string, pipelineId: string | null, _prev: R, formData: FormData): Promise<R> {
  let id = pipelineId;
  const result = await runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    if (pipelineId) await updatePipeline(ctx, pipelineId, pipelineFromForm(formData));
    else id = (await createPipeline(ctx, pipelineFromForm(formData))).id;
    revalidatePath(ws(workspaceId), "layout");
  });
  if (!result.ok || !id) return result;
  redirect(`${ws(workspaceId)}/pipelines/${id}`);
}

export async function deletePipelineAction(workspaceId: string, pipelineId: string): Promise<R> {
  const result = await runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await deletePipeline(ctx, pipelineId);
    revalidatePath(ws(workspaceId), "layout");
  });
  if (!result.ok) return result;
  redirect(`${ws(workspaceId)}/pipelines`);
}

// ---- Custom fields & tags -----------------------------------------------------

export async function saveFieldDefinitionAction(workspaceId: string, fieldId: string | null, _prev: R, formData: FormData): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    const input = formToObject(formData);
    if (fieldId) await updateFieldDefinition(ctx, fieldId, input);
    else await createFieldDefinition(ctx, input);
    revalidatePath(`${ws(workspaceId)}/settings/fields`);
  }, fieldId ? "Field updated." : "Field created.");
}

export async function setFieldArchivedAction(workspaceId: string, fieldId: string, archived: boolean): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await setFieldDefinitionArchived(ctx, fieldId, archived);
    revalidatePath(`${ws(workspaceId)}/settings/fields`);
  }, archived ? "Field archived." : "Field restored.");
}

export async function saveTagAction(workspaceId: string, tagId: string | null, _prev: R, formData: FormData): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    const input = formToObject(formData);
    if (tagId) await updateTag(ctx, tagId, input);
    else await createTag(ctx, input);
    revalidatePath(ws(workspaceId), "layout");
  }, tagId ? "Tag updated." : "Tag created.");
}

export async function deleteTagAction(workspaceId: string, tagId: string): Promise<R> {
  return runAction(async () => {
    const ctx = await actionWorkspaceContext(workspaceId);
    await deleteTag(ctx, tagId);
    revalidatePath(ws(workspaceId), "layout");
  }, "Tag deleted.");
}
