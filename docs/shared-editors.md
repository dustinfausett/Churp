# Shared documents and sheets

The Nest chat add menu creates a Document or Sheet. Members who can read the original item can edit it, subject to the Nest's posting permissions. Admin-only Nests allow only admins to edit. Members who join later cannot obtain encrypted history they were not originally entitled to read.

Editors use explicit saves with optimistic revision checks. Conflicting saves leave the draft intact and require the user to copy anything they want to retain before loading the latest version. This is shared editing, not simultaneous live co-authoring. Documents support 8,000 characters. Sheets support 50 rows and 20 columns, 500 characters per cell, within the existing encrypted-message size limit. Row and column removal requires confirmation and cannot remove the final row or column.

Contents remain encrypted using the existing Nest reader roster. Updates are signed and hidden from the chat feed and unread counts. Deleting or moderating the root item clears its saved update contents.

The shared library's Links category extracts HTTP(S) URLs locally from readable chat messages in both Nests and private conversations. It stores no click analytics and fetches no third-party link previews. Nest shared-library pagination now includes ordinary messages so encrypted links can be discovered without exposing URLs to the server.

The calendar marks the device's current local date in theme green. Your corner → My pet contains an account-persisted switch for pet flight animations; the system reduced-motion preference is still respected.

## Artwork

Generated using the built-in imagegen tool. Assets: `public/brand/activities/document.png` and `public/brand/activities/sheet.png`, both transparent PNGs.

Document prompt: Create one app menu icon for Churp: a shared DOCUMENT. Single upright cream paper sheet with folded top-right corner, three broad olive-green writing lines, a tiny sage leaf detail at lower right. Warm friendly hand-painted flat illustration, softly rounded edges, minimal texture, clear silhouette readable at 32 pixels. Palette dark olive #4b632f, sage #a3ad88, warm cream #fcfaf3, muted golden beige. Centered isolated icon, generous transparent padding, genuinely transparent background. No text, letters, watermark, border, shadow or surrounding scene. Square image.

Sheet prompt: Create one app menu icon for Churp: a shared SPREADSHEET. Single upright warm cream paper sheet with folded top-right corner, a simple olive green table grid with three columns and four rows, sage green header cells. Warm friendly hand-painted flat illustration, softly rounded edges, minimal texture, clear silhouette readable at 32 pixels. Palette dark olive #4b632f, sage #a3ad88, warm cream #fcfaf3, muted golden beige. Centered isolated icon, generous transparent padding, genuinely transparent background. No text, letters, watermark, border, shadow or surrounding scene. Square image.

Sheet revision prompt: Edit only the two human figures inside the sage green circular badge at the bottom right. Replace them with two simple warm-cream bird outlines, one larger and one smaller, with recognizable beaks, rounded bodies, wings and tails, matching Churp's gentle nature theme. Keep the circular badge, spreadsheet paper, folded corner, table grid, all existing colors, texture, dimensions, positioning and transparent background exactly as they are. No people or human silhouettes. Change nothing outside the figures in the badge.
