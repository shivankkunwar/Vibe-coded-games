# Dead Air

Relay Nine is a one-room relay station on a white salt flat. About 6–9 minutes; headphones.

## Run it

It's a static site with no build step. Serve the folder (media won't play from `file://`):

```sh
npx serve .                                                # written lines only
cd narrator && node --env-file-if-exists=.env server.mjs   # http://localhost:5173, with the live narrator
```

### Deploy (one container)

The folder is one Node service: the game and `/api/narrate` on the same origin, so the key only has to exist as an
environment variable on the host.

```sh
docker build -t dead-air .
docker run --rm -p 5173:5173 -e GEMINI_API_KEY=... dead-air
```

Any container host works (Dokploy: application from this repo, Dockerfile build, container port 5173, the API key
as an environment variable, a domain). Without a key the piece still runs; the typed moment uses its written line.

Hold anywhere (mouse, touch or Space) to wind the tape back. Let go and it plays forward.

## Artist's note

A night-shift operator talks into her log. Her monitor keeps playing her own voice forty seconds before she says
it. Holding winds the reel back: the reels reverse, her words come out backwards, and the counter runs down.
Letting go plays the tape forward to the forty-second mark, where her future voice is waiting. It says
something different each time, because you heard it.

Everything she tells you is a fair clue, burnt into an object: a lamp she never switches on, moths that come
from nowhere, a watch that was always forty seconds fast, a thermos she never drinks, no footprints to the door,
salt on the chair. She isn't the operator. She's the recording on reel fourteen, played every night by a timer
in a station that has been empty for years. The only live thing in the room is you.

At the start of the reel she asks, on air, "Station, do you copy?" and leaves the dead air open. You answer. On
the last run your words are on the tape, logged in her voice as `RX 02:13`. The three choruses turn over:
"Nothing to report" becomes "Something to report", "Relief is due at six" becomes "Relief came. From very far away",
and "Leaving the channel open" ends it, meant for you this time.

The browser is part of the station. The tab title is the frequency readout, the favicon is the ON AIR bulb,
Back winds the page and not the tape, leaving the tab is going off frequency, and your clock is set against
station time (02:14).

## The interface

Every element is a piece of equipment: an engraved plate (title, frequency, a log line with your real local time,
a TRANSMIT toggle), a 4-digit tape counter and the ON AIR bulb in the top-right of the letterbox, a broadcast
transcript in the lower left with tape-time stamps, the inline `YOU` reply, and a J-card for credits. Type:
Archivo (labels and speech) and Departure Mono (machine output only). One accent, `--signal` red, for ON AIR.
Lines tune in character by character and drop out by losing characters. Under `prefers-reduced-motion` they simply
appear and fade. Full direction: `docs/DEAD-AIR-UI.md`.

## The live narrator (optional)

Through `narrator/server.mjs` she can also type (teletype text, never voiced). Served statically, the page never
touches `/api` and uses the written lines.

| moment | where | fallback |
|---|---|---|
| answer | D=149: "Station, do you copy?", an inline `YOU` reply (Skip available), "receiving", her reply | a written reply |
| echo | the final forward run lingers at the desk while your reply surfaces as a log entry, `RX 02:13` | your own words |
| witness | prefetched at TRANSMIT, refreshed near the reveal, typed at the start of the reel | none |
| react | tab return, Back (once), pointer leaving the window: a 2.5 s budget | the META line |
| drift | return visits: details you saw last time can be quietly contradicted | none |
| farewell | the J-card | META farewell |

That's at most about 8 calls per playthrough. The note at the typed moment says when words go to an AI service.

## How it's made

- **Images:** Qwen-Image 2.1 on Modal, 16 stills including edits and depth maps. **Moving pictures:** LTX-2.5
  image-to-video on Modal, 6 clips, each shipped as forward and reversed twins.
- **Voice:** synthetic, created with Boson AI's Higgs Audio (Higgs TTS 3). **SFX:** generated locally. A tape
  drone, the watch, the station ident and tape hiss are synthesised in Web Audio as fallbacks, each with a
  time-reversed twin.
- **Picture:** a WebGL2 compositor with depth parallax, crossfades, chromatic aberration while rewinding, grade,
  dust, grain and vignette.

## Files

`js/story.js` holds all text and timing (narration ids `vo_<id>`). `js/meta.js` holds the fourth wall, `js/live.js`
the live moments, `js/ui.js` the transcript, counter and bulb, and `js/pen.js` the teletype and reply row.
Handoff docs (plot, script, UI, voice) are in `docs/`. Story v1 *Still Warm* is in `../archive/still-warm-v1/`.
