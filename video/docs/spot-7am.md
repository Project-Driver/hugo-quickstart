# "7 AM" — :30 spot for Pit Board

Rendered by `src/Spot.tsx`. Voice read in the third column; the picture is cut to it.

| Time | Picture | Voice (calm, low, one person talking to one owner) |
|---|---|---|
| 0–3 | Black. A phone lights up face-down on a truck dashboard. Dawn light. | "Yesterday, fourteen people called you." |
| 3–6 | Slow push-in on the phone. It buzzes once. | "Four you never got to." |
| 6–10 | The Pit Board text on a lock screen, shot like a product: shallow focus, the words sharp. | "One of them still needs you. This is her number." |
| 10–15 | The board scrolls: Missed 4. Texted back 3. One row in red. | "Pit Board reads your phone, your inbox, your calendar. Every morning at seven." |
| 15–20 | Punch in: Money on the table · $2,340 unpaid. A tap on "Open". | "Every dollar sitting on the table. One tap to go get it." |
| 20–24 | Wide: a van pulling out at sunrise. Silence for a beat. | "Before the first job." |
| 24–30 | Logo. Yellow line. URL. | "Pit Board, from Project Driver. Your business on one board." |

Music: a single low piano note held under the open, a slow build from :10, out at :24 so "Before the first job" lands in silence.

## Slots

- `public/broll/dashboard.mp4` (0–6) and `public/broll/van.mp4` (20–24): filmed or generated clips, 1080×1920 or larger, at least 6 s and 4 s. Without them the scene renders a lit stand-in.
- `public/audio/vo.mp3`: the read, timed to the table above. `public/audio/music.mp3`: the bed, mixed at 35%.
- Every number and name comes from the board JSON (`src/sample-board.json`); swap it for a client's board and the spot rewrites itself.
