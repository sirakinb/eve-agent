# eve-agent (Adzo / Pentridge)

Private eve agent deploy for Adzo, cofounder/chief of staff for Pentridge Media.

**Keep this repo private until scrubbed for open source.** Company data does not belong here.

## Product model

| Surface | What | Client sees? |
| --- | --- | --- |
| Chat (iMessage) | Talk to the agent | Yes |
| InsForge `memories` / `decisions` | Short facts that hydrate every turn | No |
| InsForge `company_documents` | Long docs (positioning, offer, content) | Via chat / optional email |
| Sandbox `/workspace` | Scratch mid-chat | No |
| GitHub | Code only | Never for company brain |

Each client deploy sets `COMPANY_TENANT_ID` so brain rows never cross companies.

## Local

```bash
nvm use 24
npm install
cp .env.example .env.local   # fill keys
npx eve dev
```

Deploy: `npx eve deploy` (Node 24).

## Docs

- Voice notes: `docs/voice-note-transcription.md`
- Agent notes: `AGENTS.md`
