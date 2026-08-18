import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Continues the current conversation when the user submits a lone dot. */
export default function continueConversationOnDot(pi: ExtensionAPI) {
  pi.on("input", (event) => {
    if (event.text !== ".") return { action: "continue" };

    pi.sendMessage(
      {
        customType: "continue-on-dot",
        content: "Continue the interrupted response.",
        display: false,
      },
      { triggerTurn: true, deliverAs: "followUp" },
    );
    return { action: "handled" };
  });
}
