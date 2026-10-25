# Live Poll

Real-time audience polls, word clouds, scales and quizzes. Participants join from their phones with a 6-digit code or QR code.

## Run it

```
npm install
npm run dev
```

Open http://localhost:3000, create a presentation, add slides, then click **Present**. Phones on the same Wi-Fi join at the address shown on the presenter screen. The first time you run it, Windows Firewall may ask to allow Node.js on private networks; allow it so phones can connect.

For production: `npm run build`, then `npm start`.

## Presenter shortcuts

- `→` / `Space` / `PageDown`: next slide
- `←` / `PageUp`: previous slide
- `f`: fullscreen

## How it works

- `server.ts` runs Next.js and Socket.IO on one port. All reads and writes go over Socket.IO events with acknowledgements.
- `lib/store.ts` stores data in SQLite (`data/live-poll.db`) using Node's built-in `node:sqlite`.
- `lib/logic.ts` validates and scores responses, and aggregates results.
- Each presentation has a presenter room, which gets live results, and an audience room, which gets the current slide. The answer key is never sent to participants.
- Participants are anonymous. Each browser gets a random id to limit repeat voting. Edit and present access uses a secret token saved in the creator's browser.

## Slide types

Multiple choice, word cloud (25-character limit), open ended (200-character limit), scales, quiz with answer choices, and quiz with a typed answer. Quizzes are timed and scored (500–1000 points for a correct answer; faster answers score higher), with a leaderboard.
