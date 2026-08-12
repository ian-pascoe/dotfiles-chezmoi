import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBibleVersePicker, formatBibleVerseMessage } from "./whimsical-bible-picker.js";

const pickBibleVerseMessage = createBibleVersePicker();

export default function (pi: ExtensionAPI) {
  pi.on("turn_start", async (_event, ctx) => {
    ctx.ui.setWorkingMessage(formatBibleVerseMessage(pickBibleVerseMessage()));
  });

  pi.on("turn_end", async (_event, ctx) => {
    ctx.ui.setWorkingMessage(); // Reset for next time
  });
}
