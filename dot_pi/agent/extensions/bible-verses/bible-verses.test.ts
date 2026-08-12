import { describe, expect, it } from "vitest";
import {
  createBibleVersePicker,
  formatBibleVerseMessage,
  RECENT_BIBLE_VERSE_LIMIT,
} from "./bible-verse-picker.js";
import { bibleTranslationMetadata } from "./bible-translations.js";
import { bibleVerseMessages } from "./bible-verses.js";

const referencePattern = /^(?<book>.+) \d+:(?<firstVerse>\d+)(?:-(?<lastVerse>\d+))?$/;

describe("bibleVerseMessages", () => {
  it("keeps a long, uniquely identified reading pool", () => {
    expect(bibleVerseMessages).toHaveLength(291);
    expect(new Set(bibleVerseMessages.map(({ id }) => id))).toHaveLength(bibleVerseMessages.length);
    expect(new Set(bibleVerseMessages.map(({ reference }) => reference))).toHaveLength(
      bibleVerseMessages.length,
    );
  });

  it("keeps passage metadata consistent with each reference", () => {
    for (const message of bibleVerseMessages) {
      const match = referencePattern.exec(message.reference);
      expect(match?.groups, message.reference).toBeDefined();

      const firstVerse = Number(match!.groups!.firstVerse);
      const lastVerse = Number(match!.groups!.lastVerse ?? firstVerse);
      expect(message.book).toBe(match!.groups!.book);
      expect(message.verseCount).toBe(lastVerse - firstVerse + 1);
    }
  });

  it("uses only attributed translations approved for static embedding", () => {
    const usedTranslations = new Set(bibleVerseMessages.map(({ translation }) => translation));
    expect(usedTranslations).toEqual(new Set(Object.keys(bibleTranslationMetadata)));

    for (const translation of usedTranslations) {
      const metadata = bibleTranslationMetadata[translation];
      expect(metadata.staticEmbeddingAllowed).toBe(true);
      expect(metadata.provenanceNotice).not.toHaveLength(0);
      expect(metadata.sourceUrl).toMatch(/^https:\/\//);
      expect(metadata.rightsUrl).toMatch(/^https:\/\//);
      expect(metadata.sourceArchiveSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("fits complete citations in the working-message budget", () => {
    for (const message of bibleVerseMessages) {
      const displayMessage = formatBibleVerseMessage(message);
      expect([...displayMessage].length, message.reference).toBeLessThanOrEqual(280);
      expect(displayMessage.endsWith(`— ${message.reference} (${message.translation})`)).toBe(true);
      expect(displayMessage).not.toContain("...");
    }
  });
});

describe("createBibleVersePicker", () => {
  it("does not repeat any reading from the recent-history window", () => {
    const pickBibleVerse = createBibleVersePicker(
      bibleVerseMessages.slice(0, RECENT_BIBLE_VERSE_LIMIT + 5),
    );
    const recentlyPickedIds: string[] = [];

    for (let index = 0; index < 100; index += 1) {
      const pickedMessage = pickBibleVerse(() => 0);
      expect(recentlyPickedIds).not.toContain(pickedMessage.id);
      recentlyPickedIds.push(pickedMessage.id);
      if (recentlyPickedIds.length > RECENT_BIBLE_VERSE_LIMIT) {
        recentlyPickedIds.shift();
      }
    }
  });

  it("rejects a pool that cannot satisfy the recent-history limit", () => {
    expect(() =>
      createBibleVersePicker(bibleVerseMessages.slice(0, RECENT_BIBLE_VERSE_LIMIT)),
    ).toThrow("Bible verse picker requires more than 20 messages");
  });
});
