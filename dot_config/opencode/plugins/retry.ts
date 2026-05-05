import type { Plugin } from "@opencode-ai/plugin";

const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getBackoffDelay = (attempt: number) => {
  const exponentialDelay = Math.min(
    INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    MAX_RETRY_DELAY_MS,
  );

  return Math.floor(Math.random() * exponentialDelay);
};

export const RetryPlugin: Plugin = async ({ client }) => {
  const retryAttempts = new Map<string, number>();

  const log = {
    info: async (message: string) => {
      await client.app.log({
        body: {
          service: "retry-plugin",
          level: "info",
          message,
        },
      });
    },
    error: async (message: string) => {
      await client.app.log({
        body: {
          service: "retry-plugin",
          level: "error",
          message,
        },
      });
    },
    warn: async (message: string) => {
      await client.app.log({
        body: {
          service: "retry-plugin",
          level: "warn",
          message,
        },
      });
    },
    debug: async (message: string) => {
      await client.app.log({
        body: {
          service: "retry-plugin",
          level: "debug",
          message,
        },
      });
    },
  };

  return {
    event: async ({ event }) => {
      if (event.type === "session.error") {
        const props = event.properties;
        if (!props.error || !props.sessionID) return;

        if (props.error.name === "APIError") {
          const errorMessage = String(props.error.data.message ?? "");

          let isRetryable = false;
          if (errorMessage.includes("overloaded")) {
            isRetryable = true;
          }
          // Add more conditions for retryable errors as needed

          if (isRetryable) {
            const attempt = (retryAttempts.get(props.sessionID) ?? 0) + 1;
            retryAttempts.set(props.sessionID, attempt);

            const delay = getBackoffDelay(attempt);
            log.info(
              `Temporary model provider error; retrying after jittered backoff (attempt ${attempt}, delay ${delay}ms).`,
            );
            await sleep(delay);

            const promptResponse = await client.session.promptAsync({
              path: { id: props.sessionID },
              body: {
                parts: [
                  {
                    type: "text",
                    text: "The model provider returned a temporary error. Retry the previous request and continue from where you stopped.",
                    synthetic: true,
                  },
                ],
              },
            });
            if (promptResponse.error) {
              log.error(
                `Retry prompt submission failed: ${JSON.stringify(promptResponse.error.data)}`,
              );
            }
          } else {
            retryAttempts.delete(props.sessionID);
          }
        }
      }
    },
  };
};
