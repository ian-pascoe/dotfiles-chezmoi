import assert from "node:assert/strict";
import type {
  ExtensionAPI,
  ExtensionContext,
  InputEvent,
  InputEventResult,
} from "@earendil-works/pi-coding-agent";
import { test } from "vitest";
import continueConversationOnDot from "./continue-on-dot.js";

type InputHandler = (
  event: InputEvent,
  context: ExtensionContext,
) => InputEventResult | undefined | Promise<InputEventResult | undefined>;

test("a lone dot continues the conversation without becoming a user message", async () => {
  let inputHandler: InputHandler | undefined;
  const sentMessages: Parameters<ExtensionAPI["sendMessage"]>[] = [];
  const recordingPi = {
    on(_event: string, handler: InputHandler) {
      inputHandler = handler;
    },
    sendMessage(...args: Parameters<ExtensionAPI["sendMessage"]>) {
      sentMessages.push(args);
    },
  } as unknown as ExtensionAPI;

  continueConversationOnDot(recordingPi);
  assert.ok(inputHandler);

  const context = {} as ExtensionContext;
  assert.deepEqual(
    await inputHandler({ type: "input", text: "hello", source: "interactive" }, context),
    { action: "continue" },
  );
  assert.deepEqual(
    await inputHandler({ type: "input", text: ".", source: "interactive" }, context),
    { action: "handled" },
  );
  assert.deepEqual(sentMessages, [
    [
      {
        customType: "continue-on-dot",
        content: "Continue the interrupted response.",
        display: false,
      },
      { triggerTurn: true, deliverAs: "followUp" },
    ],
  ]);
});
