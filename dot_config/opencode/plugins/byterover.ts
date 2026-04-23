import { Plugin } from "@opencode-ai/plugin";
import { Message, Part } from "@opencode-ai/sdk";
import { BrvBridge } from "@byterover/brv-bridge";

export const ByteroverPlugin: Plugin = async ({ client, directory }) => {
  const brvBridge = new BrvBridge({ cwd: directory });

  const fetchMessagesInTurn = async (sessionID: string) => {
    const messagesResponse = await client.session.messages({
      path: { id: sessionID },
    });
    if (messagesResponse.error) {
      client.app.log({
        body: {
          service: "byterover",
          level: "error",
          message: `Failed to fetch messages for session ${sessionID}: ${JSON.stringify(messagesResponse.error.data)}`,
        },
      });
      return [];
    }
    const messagesInTurn: typeof messagesResponse.data = [];
    for (let i = messagesResponse.data.length - 1; i >= 0; i--) {
      const message = messagesResponse.data[i];
      if (message.info.role === "user") break;
      messagesInTurn.unshift(message);
    }
    return messagesInTurn;
  };

  const formatMessages = (mesages: Array<{ info: Message; parts: Array<Part> }>) => {
    return mesages
      .flatMap((message) =>
        message.parts
          .filter((part) => part.type === "text")
          .map((part) => `[${message.info.role}]:\n${part.text}`),
      )
      .join("\n\n---\n\n");
  };

  const curateFromTurn = async (sessionID: string) => {
    const messagesInTurn = await fetchMessagesInTurn(sessionID);
    if (messagesInTurn.length === 0) return;

    const formattedMessages = formatMessages(messagesInTurn);
    const brvResult = await brvBridge.persist(
      `The following is a conversation between a user and an AI assistant.\n` +
        `Curate only information with lasting value: facts, decisions, technical details, preferences, or notable outcomes.\n` +
        `Skip trivial messages such as greetings, acknowledgments ("ok", "thanks", "sure", "got it"), one-word replies, anything with no substantive content.\n\n` +
        `Conversation:\n${formattedMessages}`,
      { cwd: directory },
    );
    if (brvResult.status !== "completed") {
      client.app.log({
        body: {
          service: "byterover",
          level: "error",
          message: `Byterover process failed for session ${sessionID}: ${brvResult.message}`,
        },
      });
    }
  };

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const sessionID = event.properties.sessionID;
        curateFromTurn(sessionID);
      }
    },
    "experimental.session.compacting": async ({ sessionID }) => {
      curateFromTurn(sessionID);
    },
    "experimental.chat.system.transform": async ({ sessionID }, { system }) => {
      if (!sessionID) return;

      const isReady = await brvBridge.ready();
      if (!isReady) {
        client.app.log({
          body: {
            service: "byterover",
            level: "error",
            message: "Byterover bridge not ready, skipping recall",
          },
        });
        return;
      }

      const messagesInTurn = await fetchMessagesInTurn(sessionID);
      if (messagesInTurn.length === 0) return;

      const formattedMessages = formatMessages(messagesInTurn);
      try {
        const brvResult = await brvBridge.recall(
          `The following is a conversation between a user and an AI assistant.` +
            `Recall any relevant context that would help the assistant answer the latest query.` +
            `Do not restate the query in your findings.` +
            `Conversation:\n${formattedMessages}`,
          { cwd: directory },
        );
        system.push(`<byterover-context>\n${brvResult.content}\n</byterover-context>`);
      } catch (error) {
        client.app.log({
          body: {
            service: "byterover",
            level: "error",
            message: `Byterover recall failed for session ${sessionID}: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    },
  };
};
