# Bible translation sources and rights

The Pi working-message extension at
`dot_pi/agent/extensions/whimsical.ts` displays an offline rotation of short
Bible readings. Each passage uses the translation chosen for clarity, literary
force, self-contained meaning, and a maximum 280-character display.

This note records the source and rights review performed on 2026-08-12. It is
provenance and implementation guidance, not legal advice.

## Embedded translations

All embedded translations permit unrestricted static redistribution. No
copyrighted translation with a quotation-percentage restriction is included.
The source archives are not committed; only selected passages are stored in
`extensions/whimsical/whimsical-bible-verses.ts`.

| Mark | Translation and edition | Readings | Verses | Rights | Source |
| --- | --- | ---: | ---: | --- | --- |
| WEB | World English Bible, updated 66-book protocanon | 77 | 121 | [Public domain](https://ebible.org/engwebp/copyright.htm) | [USFX](https://ebible.org/Scriptures/engwebp_usfx.zip) |
| BSB | Berean Standard Bible, eBible source dated 2026-08-08 | 84 | 125 | [Public domain](https://ebible.org/engbsb/copyright.htm) | [USFX](https://ebible.org/Scriptures/engbsb_usfx.zip) |
| ASV | American Standard Version, 1901 | 50 | 74 | [Public domain](https://ebible.org/asv/copyright.htm) | [USFX](https://ebible.org/Scriptures/eng-asv_usfx.zip) |
| DARBY | Darby Translation, 1884 | 14 | 23 | [Public domain](https://ebible.org/engDBY/copyright.htm) | [USFX](https://ebible.org/Scriptures/engDBY_usfx.zip) |
| YLT | Young's Literal Translation, 1898 | 1 | 1 | [Public domain](https://ebible.org/engylt/copyright.htm) | [USFX](https://ebible.org/Scriptures/engylt_usfx.zip) |
| DRA | Douay-Rheims American Edition, 1899 | 6 | 8 | [Public domain](https://ebible.org/engDRA/copyright.htm) | [USFX](https://ebible.org/Scriptures/engDRA_usfx.zip) |
| OEB | Open English Bible, US spelling, eBible source dated 2026-08-08 | 59 | 101 | [CC0/public domain](https://openenglishbible.org/) | [USFX](https://ebible.org/Scriptures/engoebus_usfx.zip) |

The full names, notices, source URLs, and downloaded archive checksums are kept
in `extensions/whimsical/whimsical-bible-translations.ts`. The displayed abbreviation
identifies the translation used for every passage.

## Copyrighted translations reviewed but excluded

These translations were not embedded because their standard permissions do
not clearly grant unrestricted redistribution of a source file whose content
is principally Scripture quotations:

- **ESV:** Crossway permits limited quotation subject to verse, per-book, and
  percentage-of-work conditions. Its official API adds noncommercial-use,
  attribution, storage, and access-key requirements. See the
  [ESV copyright notice](https://www.esv.org/resources/esv-global-study-bible/copyright-page/)
  and [ESV API conditions](https://api.esv.org/).
- **NIV:** Biblica's standard permission is limited by total verses, complete
  books, percentage of the work, and attribution. See
  [Biblica permissions](https://www.biblica.com/permissions/).
- **NLT:** Tyndale's standard quotation terms do not provide a blanket
  open-source redistribution license. See
  [Tyndale permissions](https://www.tyndale.com/permissions).
- **NKJV:** Thomas Nelson's standard quotation terms do not provide a blanket
  open-source redistribution license. See
  [Thomas Nelson Bible permissions](https://www.thomasnelsonbibles.com/permissions/).
- **CSB:** Holman's standard quotation terms permit limited quotation but are
  not an open-source license. See
  [CSB permissions](https://csbible.com/about-the-csb/csb-permissions/).
- **NASB 2020:** Lockman's standard quotation terms permit limited quotation
  but are not an open-source license. See
  [Lockman permissions](https://www.lockman.org/permissions/).
- **NRSVue:** Friendship Press's standard terms limit quotation and require
  attribution. See
  [Friendship Press permissions](https://friendshippress.org/permissions/).
- **The Message:** NavPress/Tyndale's standard terms limit quotation and do not
  provide a blanket open-source license. See
  [Tyndale permissions](https://www.tyndale.com/permissions).

The KJV was also excluded: although public domain in the United States and many
other jurisdictions, the Authorized Version remains subject to Crown rights in
the United Kingdom. See
[Cambridge Bible rights and permissions](https://www.cambridge.org/bibles/about/rights-and-permissions).

Adding any excluded translation requires either written permission or an
authorized runtime API integration that satisfies that publisher's current
terms. Do not copy text from an unofficial Bible API or a scraped website.

## Maintenance checks

`extensions/whimsical/whimsical-bible-verses.test.ts` verifies that:

- passage and citation IDs are unique;
- reference metadata and verse counts agree;
- every used translation has an approved rights record and source checksum;
- all rendered messages fit the 280-character budget without truncation; and
- the picker excludes the previous 20 readings.

When a source edition changes, download it from the recorded URL, verify its
rights notice, update its checksum and edition metadata, then deliberately
review any affected wording. Never silently normalize or splice Scripture text.
