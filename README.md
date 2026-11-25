# Guess That Tune

A live, six-player music trivia game. The host runs the music from one device; players join on their own phones with a room code. No player accounts or sign-ins.

## Features
- Up to six players per room (host plus five guests)
- Host-controlled YouTube playback in the game
- Random song order with optional genre and decade filters
- Shared round countdown, answer reveal, live scoreboard
- Host awards +5 or +10 points after players guess aloud
- Mobile-friendly layout; no player answer typing

## Deploy on Render
1. Create a free account at https://render.com and connect GitHub.
2. Choose **New + → Blueprint** and select `guzmanpes/guess-that-tune`.
3. Render reads `render.yaml`; accept the web service creation.
4. Wait for the deploy to finish, then open the Render URL on the host phone and share the room code.

## Add songs
On the host screen, add a YouTube URL plus song title, artist, year and genre for each track. Use a normal YouTube watch URL or youtu.be link. The host device starts playback; browser autoplay rules may require tapping the YouTube player once.

## Notes
- Rooms are in memory; a server restart clears active rooms.
- This starter uses a single server instance. Do not scale it to multiple instances without adding a shared Socket.IO adapter and persistent room store.
- YouTube playback is subject to YouTube availability, embed restrictions, and browser autoplay policies.
