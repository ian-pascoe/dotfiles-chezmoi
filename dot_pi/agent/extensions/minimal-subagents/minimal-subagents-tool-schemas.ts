import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type TSchema } from "typebox";
import { THINKING_LEVELS } from "./minimal-subagents-capabilities.js";

const SessionContextSchema = StringEnum(["inherit", "compact", "omit"] as const);
const ProjectContextSchema = StringEnum(["inherit", "omit"] as const);
const ThinkingLevelSchema = StringEnum(THINKING_LEVELS);
const ToolSelectionSchema = Type.Union([
  StringEnum(["none", "read", "modify"] as const),
  Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
]);

/** Build all six strict TypeBox schemas, including the refreshed runtime model enum. */
export function createCoordinatorToolSchemas(modelIds: readonly string[]) {
  const explicitModelSchema: TSchema =
    modelIds.length > 0 ? StringEnum(modelIds as [string, ...string[]]) : Type.Never();
  return {
    subagent: Type.Object({
      task: Type.String({ minLength: 1, description: "Task for the persistent child agent" }),
      agent_id: Type.Optional(Type.String({ description: "Friendly peer-unique ID segment" })),
      session_context: Type.Optional(SessionContextSchema),
      project_context: Type.Optional(ProjectContextSchema),
      model: Type.Optional(explicitModelSchema),
      thinking_level: Type.Optional(ThinkingLevelSchema),
      tools: Type.Optional(ToolSelectionSchema),
    }),
    subagent_message: Type.Object({
      agent_id: Type.Optional(Type.String({ description: "Canonical agent ID, parent, or *" })),
      message: Type.String({ minLength: 1 }),
      behavior: Type.Optional(StringEnum(["steer", "follow-up"] as const)),
    }),
    subagent_wait: Type.Object({
      agent_id: Type.String({ minLength: 1 }),
      timeout_ms: Type.Optional(Type.Integer({ minimum: 0 })),
    }),
    subagent_status: Type.Object({
      agent_id: Type.Optional(Type.String({ minLength: 1 })),
    }),
    subagent_cancel: Type.Object({
      agent_id: Type.String({ minLength: 1 }),
      recursive: Type.Optional(Type.Boolean()),
    }),
    subagent_delete: Type.Object({
      agent_id: Type.String({ minLength: 1 }),
      recursive: Type.Optional(Type.Boolean()),
    }),
  };
}
