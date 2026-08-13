# iMessage Voice-Note Transcription: How It Works and How We Got There

**Status:** Working in production as of 2026-08-12.
**Symptom fixed:** Sending a native iMessage voice memo to Pentridge (+1 628-264-7648) used to get back "I can't access the audio — only the transcription failure notice came through." Now the agent hears a Whisper transcript of the memo.

## The pipeline (current state)

When a voice memo arrives at `POST /eve/v1/photon`:

1. **`agent/channels/photon.ts` → `onMessage`** runs before eve builds the model input, and calls `hydrateVoiceNote(message, ctx.thread)`.
2. **`agent/lib/photon-voice.ts`** detects a voice note (webhook content `type === "voice"` or an audio attachment), then:
   - Grabs the eve iMessage adapter off the chat-sdk thread via its **public `thread.adapter` getter** (duck-typed: `name === "imessage"` and `resolveMessage` is a function).
   - Calls **`adapter.resolveMessage(thread.id, message.id)`**. This re-fetches the full message from Photon Cloud over gRPC and returns content whose attachments carry a real `read()` backed by a gRPC download stream.
   - Collects readable attachments. It prefers audio-looking parts (`audio/*` mime or `.caf`/`.m4a`/etc. filename) but **falls back to any attachment with `read()`** — Photon's `getAttachmentInfo` reports voice memos as `application/octet-stream`, so a strict mime filter rejects them. Safe because this path only runs for messages already flagged as voice notes.
   - Reads the bytes (skips empty or >25MB), converts CAF→m4a with `ensureM4a` from `spectrum-ts/authoring` (spawns the bundled ffmpeg; ffmpeg sniffs the container from bytes, so the mime label is irrelevant), and transcribes with `transcribe({ model: gateway.transcriptionModel("openai/whisper-1"), audio })`.
   - Writes `[Voice note] <transcript>` onto `message.text`. This matters because chat-sdk's `messageToUserContent` **drops attachments that have no URL** (Photon audio never has one) but always keeps `message.text` — so the model hears the transcript.
3. **`agent/agent.ts`** carries the build config that makes ffmpeg exist in production:

   ```ts
   build: { externalDependencies: ["ffmpeg-static", "ffmpeg-static*"] }
   ```

   - `"ffmpeg-static"` (plain) — makes eve's compiler keep the import **external** instead of inlining the JS wrapper.
   - `"ffmpeg-static*"` (star) — Nitro's **full-trace** syntax: copies *all* package files, including the ~45MB `ffmpeg` binary, into the function's `node_modules/`. Without the star, tracing copies only statically-referenced JS and the binary is missing (spawn ENOENT).
   - `eve deploy` builds on Vercel's Linux machines, so the binary npm downloads there is linux-x64. Never build-and-upload from a Mac for this.

## Why every earlier attempt failed

These are load-bearing dead ends. **Do not retry them.**

| Attempt | Why it failed |
| --- | --- |
| Use the webhook payload's audio directly | Photon webhooks are metadata-only: `{ mimeType, type: "voice", name, size }` — no attachment id, no URL, no bytes. Additionally, eve's webhook content converter has **no `voice` case**, so voice content falls through to a passthrough stub with no `read()` (only `attachment`-type content gets a lazy `read()` wired). |
| `Spectrum()` from npm `spectrum-ts` + `getAttachment` | Its cloud client calls `createGrpcClient`, which resolves `nice-grpc`/`nice-grpc-common`/`@grpc/grpc-js` **at runtime by bare specifier from inside eve's bundled `/var/task/_libs/`**. Adding `import "nice-grpc"` to our TS does nothing — bundled imports don't create resolvable packages on disk. |
| `@photon-ai/advanced-imessage` `createHttpClient` → `imessage.spectrum.photon.codes` | That host is the **gRPC** endpoint; HTTP requests get 415 from the intermediary. Photon's hosted cloud exposes no public HTTP middleware host (`IMESSAGE_HTTP_ADDRESS` is for self-hosted only). |
| `imessage(adapter.app)` from npm `spectrum-ts` | The adapter's Spectrum instance is a **vendored copy compiled into eve**; the npm package's narrowing helper doesn't recognize it ("Platform imessage is not registered"). |
| Groveling `app.__internal.platforms.get("imessage")` | Works on the npm build's internals; the vendored Spectrum app has no `__internal`, so the lookup silently found nothing and the code fell back to the broken npm `Spectrum()`. |
| Strict `audio/*` mime filter on fetched attachments | Fetched voice memos come back as `type: "attachment"` with `mimeType: application/octet-stream`. First post-fix test failed with `audioParts: 0` for exactly this reason. |

## The process that actually cracked it

Roughly the order of operations, for next time something opaque breaks inside eve:

1. **Read prod logs first, as JSON.** `vercel logs pentridge-agent.vercel.app --since 30m --json` — the plain view truncates messages; the JSON has full stack traces. The stack showed the failure inside `/var/task/_libs/@spectrum-ts/...`, i.e. **eve's vendored copy**, not our npm dependency — and that the adapter's own `Spectrum started` succeeded in the same invocation. That contradiction (gRPC works for the adapter, fails for us) was the key clue.
2. **Read eve's compiled bundles as the source of truth.** The npm packages' source is *not* what runs; eve vendors and recompiles. Searching `node_modules/eve/dist/src/compiled/@photon-ai/chat-adapter-imessage/index.js` (2.4MB, minified — searched by string, then dumped windows around hits with `node -e`) established:
   - `nice-grpc` is **inlined** in the adapter bundle → the adapter's runtime can always fetch.
   - The webhook converter has no `voice` case → webhook content is a dead stub, re-fetch is mandatory.
   - The adapter class (`name = "imessage"`) exposes a public **`resolveMessage(threadId, messageId)`** → cache-miss → `space.getMessage(id)` → gRPC fetch → attachments built with `read: () => downloadStream(...)`. Message ids (`spc-msg-…`) pass through as guids unchanged.
   - The chat-sdk `Thread` class has a public `adapter` getter.
3. **Find the sanctioned config for the binary.** eve's `create-application-nitro.js` reads `manifest.config.build.externalDependencies` and passes it to Nitro's `traceDeps`; Nitro's docs document the `"pkg*"` full-trace form. That replaced all hacks for getting ffmpeg onto Vercel.
4. **Verify locally before deploying.** `VERCEL=1 npx eve build` produces the same layout as production; confirmed `.vercel/output/functions/__server.func/node_modules/ffmpeg-static/ffmpeg` exists and the compiled channel kept `import("ffmpeg-static")` external.
5. **Instrument before the next round-trip.** Each deploy+test cycle costs minutes, so the hydrate path logs everything needed to diagnose in one shot: `messageId`, `threadId`, `fetchedId`, `contentType`, per-part `mimeType`/`name`, and a full function-stripped content dump when no readable part is found. That's how the mime-filter bug was identified and fixed from a single log line (`audioParts: 0`).

## Operational notes

- **Debugging a failure:** `vercel logs pentridge-agent.vercel.app --since 15m --json` and look for `Hydrating iMessage voice note` (happy path), `Voice note fetch returned no readable attachment` (content shape changed), or `Failed to transcribe iMessage voice note` (fetch/ffmpeg/Whisper error with stack).
- **eve CLI needs Node ≥ 24;** the default nvm node here is 22. Prefix with `export PATH=/opt/homebrew/opt/node/bin:$PATH` (Node 26) before `eve build` / `eve deploy`.
- **Deploys:** `eve deploy` (= `vercel deploy --prod`, builds remotely on Linux). That is the only way production updates.
- **Fragility warning:** `thread.adapter.resolveMessage(...)` is a public method of eve's compiled adapter, but eve upgrades could change it. The code duck-types and fails soft (logs `adapterFound: false` + apology text) rather than crashing the turn. If an eve upgrade breaks voice notes, start at step 2 above against the new compiled bundle.
