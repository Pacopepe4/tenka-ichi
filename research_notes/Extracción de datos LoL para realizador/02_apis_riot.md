# Riot official and semi-official sources for LIVE League of Legends data (broadcast production) — state at 13 Nov 2026

Research caveat for the report writer: in this research session only github.com / raw.githubusercontent.com were fetchable. developer.riotgames.com, support.riotgames.com, hextechdocs.dev, vickz84259.github.io, docs.rs, esports.gg, sheepesports, GRID/riotesportsdata and others failed DNS. Riot's own docs pages (Live Client Data, Replay API, Tournament-V5, policies) were therefore NOT read directly. Where a claim comes from a web-search snippet (not a page I opened), it is marked "(search snippet)". Primary sources I did read in full: Riot's open-source League Director repo (code), the community OpenAPI spec for the lolesports API, and several RiotGames/developer-relations GitHub issues (with Riot staff replies). Items from my own background knowledge are NOT cited and are labelled "uncited background" inside Inferences/Gaps; treat them as to-verify.

---

## 1. Live Client Data API (https://127.0.0.1:2999/liveclientdata/...)

### Takeaway
It is a local, per-game-client HTTPS API designed for the local player; in spectator it only partly works (no activePlayer data, team gold/CS/positions/cooldowns absent, Baron/Dragon/Herald events missing), and Riot has repeatedly declined (2020, 2023, still open in Nov 2026) to expand it for esports/spectator use. Since Oct 2026 Riot blocks game-memory access by unknown third-party apps, which removes the only workaround for the missing data.

### Cited Findings
- Base URL is `https://127.0.0.1:2999/liveclientdata/`; known paths include `/liveclientdata/activeplayer`, `/liveclientdata/activeplayerabilities`, `/allgamedata` (returns everything; other endpoints return subsets of it); it works only while the client is running and a game is in progress, not in lobby — (search snippet) [docs.rs lol-game-client-api / Go clients](https://docs.rs/crate/lol-game-client-api/latest/source/src/api.rs), [pkg.go.dev clientapi](https://pkg.go.dev/github.com/breadinator/lolapi/clientapi)
- `allgamedata` structure (Go struct): `activePlayer`, `allPlayers`, `events`, `gameData`. `gameData` = gameMode, gameTime, mapName, mapNumber, mapTerrain. `activePlayer` includes abilities, championStats, currentGold, level, summonerName — (search snippet) [pkg.go.dev Jonchun/lige liveclientdata](https://beta.pkg.go.dev/github.com/Jonchun/lige/liveclientdata)
- `playerlist` entries include: isBot, isDead, items, level, position (lane string), respawnTimer, runes (keystone + primary/secondary trees, each with id/displayName/rawDescription), scores (assists, creepScore, deaths, kills, wardScore), summonerSpells (summonerSpellOne/Two with displayName/rawDisplayName), team; Rust clients accept a `teamID` query filter on playerlist — (search snippet) [pkg.go.dev breadinator/lolapi](https://pkg.go.dev/github.com/breadinator/lolapi/clientapi), [docs.rs irelia](https://docs.rs/crate/irelia/0.11.2/source/src/in_game.rs)
- Riot publishes a sample payload at `static.developer.riotgames.com/docs/lol/liveclientdata_sample.json` (not fetched; host blocked) — (search snippet) [pkg.go.dev Jonchun/leagueliveapi](https://pkg.go.dev/github.com/Jonchun/leagueliveapi)
- In spectator mode and replays, activePlayer data is absent (claim from one Rust crate's docs) — (search snippet) [docs.rs irelia-cli in_game.rs](https://docs.rs/irelia-cli/0.5.6/src/irelia_cli/in_game.rs.html)
- Riot staff position (Collaborator RiotTuxedo, 6 Oct 2020, issue #236): the Live Client Data API "was built for the local player in an active game"; many features work in spectator mode but spectator support was not an original goal; spectator issues are "out of scope" for now — [RiotGames/developer-relations #236](https://github.com/RiotGames/developer-relations/issues/236)
- Issue #236 (open since 14 Feb 2020, label "on hold: escalated to team"): when spectating, `allgamedata` events contain only champion kills and turret/inhibitor kills; Baron, Dragon and Herald kill events are missing. Still being chased Feb and Aug 2025 with no further Riot reply — [#236](https://github.com/RiotGames/developer-relations/issues/236)
- Gold is deliberately excluded: Riot (RiotTuxedo, 15 Oct 2020 and 19 Feb 2021, issue #387) said player gold was "considered and unfortunately purposefully excluded" because gold is hidden in-game by design; Riot may ask apps that create a competitive advantage to remove features — [#387](https://github.com/RiotGames/developer-relations/issues/387)
- Open requests with no Riot reply: #216 (esports broadcast data: team gold, per-player damage, objective timestamps/respawns; opened 3 Jan 2020; +1s as late as 13 Nov 2026), #607 (on-screen data in spectator: team gold, dragon type, herald, baron events; Feb 2022), #1095 (current gold + proper CS in spectator, plus longer-term cooldowns and real map positions; 22 Aug 2025) — [#216](https://github.com/RiotGames/developer-relations/issues/216), [#607](https://github.com/RiotGames/developer-relations/issues/607), [#1095](https://github.com/RiotGames/developer-relations/issues/1095)
- #1095 states Gold and CS are disabled in the normal (non-spectator) mode and asks for them in Spectator mode, noting that people must rely on memory reading — [#1095](https://github.com/RiotGames/developer-relations/issues/1095)
- Issue #1211 (13 Nov 2026) documents current gaps: `playerlist[].items[]` only returns slots 0-6, so the role-quest slot (8) is missing (an ADC's boots disappear from the API when the role quest completes); `count` only covers consumables so no stack values; `/replay/render` has `interfaceQuests` that only toggles UI, no data. Match-V5 has undocumented `participants[].roleBoundItem`; timeline shows ITEM_DESTROYED for 12xx quest items only post-game and not for custom games — [#1211](https://github.com/RiotGames/developer-relations/issues/1211)
- Issue #260 (Mar 2020, closed "not planned" 27 Dec 2023): request to unify the esports Livestats feed with Live Client Data. Riot contributor tisbells: DevRel does not own the esports or client APIs, merging is "very unlikely" as they are separate services — [#260](https://github.com/RiotGames/developer-relations/issues/260)
- Same issue describes the Livestats feed as undocumented and powering watch.lolesports.com, with fewer data points than its deprecated predecessor WebSocket feed — [#260](https://github.com/RiotGames/developer-relations/issues/260)
- Overlay authors for amateur/community leagues (mostly custom games via in-client spectator) report there is no official source for role-quest state or item stacks; options left are "reading pixels from the screen or closed commercial tools" — [#1211](https://github.com/RiotGames/developer-relations/issues/1211)
- Riot DevRel FAQ (search snippet): LCU and in-game API apps are still expected to work, but DevRel does not own those APIs and cannot guarantee support/updates — (search snippet) [developer.riotgames.com/docs/faqs](https://developer.riotgames.com/docs/faqs)
- An Overwolf forum thread claims Riot changed port 2999 to a random port and clients must discover it via the process list; custom games reportedly worked; status unresolved, date unknown — (search snippet, single unverified report) [discuss.overwolf.com](https://discuss.overwolf.com/t/lol-live-client-data-event-not-sending-updates/974)
- LiveEvents API (separate from liveclientdata): enabled via `game.cfg` `[LiveEvents]` section with `Enable=1` and `Port=34243`, plus a `LiveEvents.ini` listing events: OnKillDragon_Spectator, OnKillRiftHerald_Spectator, OnKillWorm_Spectator, OnTurretPlateDestroyed, OnDragonSoulGiven. Used by RCVolus observer tool to get the objective events missing in liveclientdata — [RCVolus/league-observer-tool](https://github.com/RCVolus/league-observer-tool)

### Inferences
- For a producer using custom-game / tournament-realm spectating, the official local feed gives per-player KDA/CS(creepScore)/items/runes/respawnTimer/level/isDead plus event log, but no gold, damage, positions, cooldowns, vision. Gold and CS appear to be restricted ("disabled") even for non-active players (#1095, #387); whether `scores.creepScore` is populated for all players in spectator is contradictory in the sources (issue #1095 says CS is improper/disabled).
- Because Riot staff have not replied on #216/#607/#1095 for years, plan around the absence of an official team-gold/position feed rather than waiting for one.
- Uncited background (verify): endpoint list is `allgamedata, activeplayer, activeplayername, activeplayerabilities, activeplayerrunes, playerlist, playerscores, playersummonerspells, playermainrunes, playeritems, eventdata (optional ?eventID=), gamestats`; TLS uses a Riot self-signed root cert (clients commonly skip verification); polling (no push) at ~1 Hz is typical and data updates once per game tick; the API also works in live custom games for the local player.

### Gaps
- Could not read Riot's official Live Client Data doc (developer.riotgames.com blocked), so the exact endpoint list, refresh rate and the official statement about spectator/replay behavior is not confirmed from the primary source.
- No source found on positions: issue #1095 implies map positions are not exposed (only screen positions) but the exact wording of the API's `position` field in playerlist (lane string vs coordinates) was not verified.
- No evidence found on whether Live Client Data works inside a Replay (.rofl) session in 2026; one crate says activePlayer is absent in replays/spectator. Needs a live test.
- No source on any 2025-2026 formal deprecation of Live Client Data; none found. Port-randomization claim is unverified.

---

## 2. Replay API (/replay/*): controllable fields, directors, live spectating

### Takeaway
The Replay API is a local HTTPS REST API on 127.0.0.1:2999 enabled with `EnableReplayApi=1` in game.cfg; it exposes playback, render (camera + HUD toggles + graphics), recording, sequence, particles and game resources. Riot's own League Director shows the field list and automated observers (RCVolus tool) use it for time control. Whether it works in live (delayed) spectator games versus replays is not confirmed by any source I read.

### Cited Findings
- Replay API went live in patch 9.4 (2019); League Director is Riot's sample tool illustrating the game client API for camera manipulation in replays — (search snippet) [Riot DevRel on X](https://x.com/riotgamesdevrel/status/1099137660692492288)
- Enable: set `EnableReplayApi=1` under `[General]` in `[install]\Config\game.cfg` and restart the replay. Riot's League Director is Windows-only; for skybox/extra rendering the graphics must be "Very High" and the replay restarted. FPS Camera is selected from the in-game Camera Modes drop down — [RiotGames/leaguedirector README](https://raw.githubusercontent.com/RiotGames/leaguedirector/master/README.md)
- Host `https://127.0.0.1:2999`; resources and URLs (from League Director api.py): `/replay/game` (readonly: `processID`), `/replay/recording`, `/replay/render`, `/replay/particles`, `/replay/playback`, `/replay/sequence` (write-only) — [leaguedirector api.py](https://raw.githubusercontent.com/RiotGames/leaguedirector/master/leaguedirector/api.py)
- Reads are GET; writes are POST with a JSON body containing only the changed fields (e.g. `{"paused": true, "time": 120.5}`); League Director trusts the game's self-signed cert via a bundled `riotgames.pem` — [api.py](https://raw.githubusercontent.com/RiotGames/leaguedirector/master/leaguedirector/api.py)
- `/replay/playback` fields: `paused` (bool), `seeking` (bool), `time` (float seconds), `speed` (float), `length` (float) — [api.py](https://raw.githubusercontent.com/RiotGames/leaguedirector/master/leaguedirector/api.py)
- `/replay/recording` fields: `recording` (bool), `path`, `codec`, `startTime`, `endTime`, `currentTime`, `width`, `height`, `framesPerSecond`, `enforceFrameRate`, `replaySpeed` — [api.py](https://raw.githubusercontent.com/RiotGames/leaguedirector/master/leaguedirector/api.py)
- `/replay/render` fields — camera: `cameraLockX/Y/Z` (bool), `cameraMode` (string), `cameraPosition` {x,y,z}, `cameraRotation` {x,y,z}, `cameraAttached` (bool), `cameraMoveSpeed`, `cameraLookSpeed`, `fieldOfView`, `nearClip`, `farClip`; world: `fogOfWar`, `outlineSelect`, `outlineHover`, `floatingText`, `navGridOffset`, `simulateAllParticlesWhileOffScreen`; interface: `interfaceAll`, `interfaceReplay`, `interfaceScore`, `interfaceScoreboard`, `interfaceFrames`, `interfaceMinimap`, `interfaceTimeline`, `interfaceChat`, `interfaceTarget`, `interfaceQuests`, `interfaceAnnounce`, `interfaceKillCallouts`, `interfaceNeutralTimers`; health bars: `healthBarChampions/Structures/Wards/Pets/Minions`; visibility: `environment`, `characters`, `champions`, `minions`, `particles`, `banners`; skybox: `skyboxPath/Rotation/Radius/Offset`, `sunDirection`; fog: `depthFog*` and `heightFog*` (Enabled/Start/End/Intensity/Color {r,g,b,a}); depth of field: `depthOfFieldEnabled/Debug/Circle/Width/Near/Mid/Far` — [api.py](https://raw.githubusercontent.com/RiotGames/leaguedirector/master/leaguedirector/api.py)
- `/replay/sequence` (write-only) accepts keyframe arrays for `playbackSpeed`, `cameraPosition`, `cameraRotation`, `fieldOfView`, clip planes, skybox, fog and DoF fields — [api.py](https://raw.githubusercontent.com/RiotGames/leaguedirector/master/leaguedirector/api.py)
- `cameraMode` has five values (top, fps, tps, focus, path) and `selectionName` only highlights a player without engaging camera follow — per one community GitHub issue (unofficial, unverified) — (search snippet) [daniyal-rahman/ahriuwu #9](https://github.com/daniyal-rahman/ahriuwu/issues/9)
- Riot's docs describe POST `/replay/render` as changing render properties with every value optional — (search snippet) [developer.riotgames.com/docs/lol](https://developer.riotgames.com/docs/lol)
- League Director features: attach camera to champion or minion; toggle HUD, health bars, notifications; FOV, clipping, skyboxes, fog, DoF; keyframed sequencer; video capture webm/png — [leaguedirector README](https://raw.githubusercontent.com/RiotGames/leaguedirector/master/README.md)
- The RCVolus league-observer-tool (part of lol-prod-toolkit) uses the Replay API "for time controls, similar to LeagueDirector", LCU for champ-select/lobby modules, LiveEvents for objective events; it implemented passive memory reading (Farsight-based) from v5.0.0 but is disabling it because of Vanguard ("could result in a ban") — [RCVolus/league-observer-tool](https://github.com/RCVolus/league-observer-tool)
- The Rust crate irelia notes that replay and in-game endpoints share the same URL, use MsgPack, are capped at 512 KB and fail when no replay is active — (search snippet) [docs.rs irelia replay.rs](https://docs.rs/crate/irelia/latest/source/src/replay.rs)
- A community issue (#216) from Jan 2020 points to the Replay API as an "undocumented endpoint on localhost:2999" for game time — [#216](https://github.com/RiotGames/developer-relations/issues/216)
- Riot 26.20/26.21 replay changes (separate from the local Replay API): Riot planned to restrict replay downloads, then delayed to 26.21 and instead capped downloads at 10 per hour (own replays plus other players' replays still downloadable); motive: security/closing exploits for unauthorized tools; press framing about AI scraping not Riot's own wording — (search snippet) [rdy.gg](https://rdy.gg/en/lol/news/lol-replays-10-hour), [Dot Esports](https://dotesports.com/league-of-legends/news/riot-delays-league-replay-changes-patch-26-21), [esports.gg](https://esports.gg/news/league-of-legends/private-replays-delayed/); conflicting coverage on exact outcome, see Gaps

### Inferences
- A "director" automation loop is: POST `/replay/render` `{cameraMode, cameraAttached, selectionName?, interfaceXxx...}` + POST `/replay/playback` `{time, speed, paused}`, driven by event data from another source. The full camera/HUD surface (HUD element toggles, health bar toggles, minimap, scoreboard, kill callouts, neutral timers) is exactly what a broadcast "clean feed" needs (e.g. `interfaceAll=false` with the custom overlay on top).
- The local Replay API likely runs inside any League client replay session; for live spectator games, the RCVolus/LeagueBroadcast ecosystem (which targets live observer clients) implies at least `playback` is reachable there, but no source states this explicitly. Treat as to-verify.
- Uncited background (verify): `selectionName` is a render field naming the selected champion; `cameraMode` values are lower-case strings; positions in render are world units; the game spectator client of custom games is the "observer" client with the same API.

### Gaps
- Official Replay API doc (developer.riotgames.com/replay-apis.html) and hextechdocs.dev could not be fetched, so `selectionName` and the exact allowed `cameraMode` values are unverified (League Director's api.py does not include selectionName at all).
- No source confirms replay API availability in live spectator/delayed spectator games; none on 2025-2026 changes to Replay API itself.
- Conflicting accounts of the 26.20/26.21 replay-download restriction; I could not read Riot's own announcement. Whether the local Replay API is affected: no evidence.

---

## 3. LCU API (League Client Update)

### Takeaway
LCU is the unofficial local client API (lockfile port + auth token) used by many tools for champ select, lobby and gameflow; Riot tolerates only a policy-approved subset and states DevRel does not own or guarantee it. Useful for pick/ban overlays in tournament draft, subject to policy.

### Cited Findings
- Riot published LCU policy posts: an older post set pre-release notification for LCU apps, a Korea restriction and an approved-endpoint list; Riot's current League Client API policy page says developers must follow policy changes, may not act as a data broker, and may not resemble Riot products — (search snippet) [riotgames.com/en/DevRel/changes-to-the-lcu-api-policy](https://www.riotgames.com/en/DevRel/changes-to-the-lcu-api-policy), [developer.riotgames.com/league-client-apis.html](https://developer.riotgames.com/league-client-apis.html)
- The DevRel FAQ says LCU and in-game API apps are still expected to work, but DevRel does not own them and cannot offer support/guarantee updates — (search snippet) [developer.riotgames.com/docs/faqs](https://developer.riotgames.com/docs/faqs)
- RCVolus observer tool: click "Sync" on modules; the League Client must be running; it relays LCU data to the lol-prod-toolkit — [RCVolus/league-observer-tool](https://github.com/RCVolus/league-observer-tool)
- LeagueBroadcast ported RCVolus's champ-select pick/ban tool with a configurable delay; ingame features are dead due to Vanguard, "only champ select works" per search snippet — [floh22/LeagueBroadcast](https://github.com/floh22/LeagueBroadcast)

### Inferences
- LCU champ-select data (draft, bans, summoner names, session timer) is the practical source for draft overlays; legal status: allowed under the League Client API policy with approved endpoints but "unsupported", so exposure to breakage per patch.
- Uncited background (verify): endpoints like `/lol-champ-select/v1/session`, `/lol-gameflow/v1/session`, `/lol-lobby/v2/lobby`; websocket at `wss://127.0.0.1:<port>/` subscribing to `OnJsonApiEvent`; credentials from the `lockfile` (`riot:<password>`).

### Gaps
- Current (2026) text of the League Client API policy and the approved-endpoint list not read; Korean-player restriction status unknown.
- No source on LCU websocket event names (background only).

---

## 4. Riot public API: Spectator-V5, Match-V5 timeline, Tournament-V5, rate limits, production key

### Takeaway
Riot's web API is post-game/near-line data (spectator metadata only), not a live broadcast feed. Tournament-V5 is the official way to run codes/lobbies for custom tournaments with callbacks, but requires tournament API access approval; Spectator-V5 gives only active-game roster metadata and a replay-grid encryption key.

### Cited Findings
- Spectator-V5 provides by-summoner active game lookups (404 if not in a game) and a featured-games list; the response includes an `encryptionKey` for decrypting spectator-grid playback data; auth is header `X-Riot-Token` — (search snippet) [developer.riotgames.com/api-details/spectator-v5](https://developer.riotgames.com/api-details/spectator-v5), [jentic mirror](https://jentic.com/apis/developer.riotgames.com/riot-games.md)
- Spectator-V4 had a 404-after-patch-14.1 bug (closed Jan 2024) and "returns a finished game" bug (closed May 2024) in issues #876 and #227 — [RiotGames/developer-relations issue list](https://github.com/RiotGames/developer-relations/issues?q=is%3Aissue+live+client+data+spectator)
- Spectator-V5 lacks lane/role per participant; request open since 8 Mar 2026 (#1142); role is only in Match-V5 post-game — [#1142](https://github.com/RiotGames/developer-relations/issues/1142)
- Match-V5 timeline: only available post-game; the timeline shows ITEM_DESTROYED for quest items only after the game and not in custom games — [#1211](https://github.com/RiotGames/developer-relations/issues/1211)
- Tournament-V5 (announced 11 Oct 2023): fully available to apps with tournament API access; Tournament-Stub-V5 can be used with a development key to test; uses PUUID instead of summoner ID — (search snippet) [riotgames.com/en/DevRel/tournament-v5-is-coming](https://riotgames.com/en/DevRel/tournament-v5-is-coming)
- Providers must first call the lobby-events/provider registration endpoint to register callback URL (and API key) before other tournament endpoints work; callback URL must be well-formed http/https on the protocol's default port; the PUT code endpoint updates pick type, map, spectator type, allowed PUUIDs; for codes created after 10 Nov 2023 a lookup of recorded game/callback attempt works — (search snippet) [riot-docs mirror tournament-v5.md](https://glama.ai/mcp/servers/@chirpon9/riot-docs-mcp/blob/bd23bbcbe155efed4c6774a7dde0bb8020d76191/src/riot_docs/tournament-v5.md)
- A community comparison site states a hobby tournament platform was still awaiting Riot production approval — (search snippet, non-authoritative) [lol-tournament-platform.pages.dev](https://lol-tournament-platform.pages.dev/how-it-works)
- Riot policy: developer policy last updated 11 Mar 2025 (general policy); League-specific Developer API Policy exists in the support site — (search snippet) [developer.riotgames.com/policies/general](https://developer.riotgames.com/policies/general)
- Memory access change: Riot support notice says the official API becomes the only permitted route for retrieving game data; approved tools have until April 2027 to transition, request data via approved channels or sunset features; it does not ban players by itself — (search snippet) [support.riotgames.com game-memory-access-removed-for-third-party-apps](https://support.riotgames.com/ar-ae/riot/performance/game-memory-access-removed-for-third-party-apps)

### Inferences
- For amateur leagues: Tournament-V5 codes can lock lobby parameters (pick type, map, spectator type) and the callback delivers match results; but it needs tournament-API approval via a production application, and results arrive after the game, not live.
- Uncited background (verify): dev keys 20 req/s and 100 req/2 min; production keys start higher (commonly 500/10s and 30,000/10min app-level, per-method limits vary); personal production keys have lower limits; Tournament API requires an approved production app with a tournament use case, and the tournament API is not available on personal/dev keys beyond stub; Spectator-V5 live games are subject to the standard ~3 min spectator delay for non-custom games.

### Gaps
- Official rate-limit numbers, production-key application criteria, and Tournament-V5 endpoint paths/fields were not fetched (portal blocked). No authoritative source on delay of Spectator-V5 data.
- No source found on exactly what "spectator type" values mean (NONE/LOBBYONLY/ALL).

---

## 5. LoL Esports API / Livestats feed

### Takeaway
There are two unofficial-but-public surfaces: `esports-api.lolesports.com/persisted/gw` (schedule/events/standings, needs a public x-api-key) and `feed.lolesports.com/livestats/v1` (`/window/{gameId}`, `/details/{gameId}`) which powers watch.lolesports.com. Riot does not document it; the community OpenAPI by vickz84259 is the reference. Official partners (GRID) now distribute Riot's licensed live data.

### Cited Findings
- Hosts: `https://esports-api.lolesports.com/persisted/gw` and `https://prod-relapi.ewp.gg/persisted/gw` for schedule endpoints; `https://feed.lolesports.com/livestats/v1` for live stats; old Highlander API `https://api.lolesports.com/api/v1|v2` — [vickz84259 openapi.yaml](https://raw.githubusercontent.com/vickz84259/lolesports-api-docs/master/openapi.yaml)
- Auth: header `x-api-key`; the spec states the (public, from the lolesports.com web client) key is `0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z` — [openapi.yaml](https://raw.githubusercontent.com/vickz84259/lolesports-api-docs/master/openapi.yaml). Spec is "unofficial documentation", version 1.0.0-alpha-1 — same file.
- Persisted gateway endpoints: `/getLeagues`, `/getSchedule`, `/getLive` (ongoing matches; events null if none), `/getTournamentsForLeague`, `/getStandings`, `/getCompletedEvents`, `/getEventDetails`, `/getTeams`, `/getGames` — all take `hl` (locale) — [openapi.yaml](https://raw.githubusercontent.com/vickz84259/lolesports-api-docs/master/openapi.yaml)
- `GET /window/{gameId}?startingTime=<RFC3339>` returns `esportsGameId`, `esportsMatchId`, `gameMetadata` {patchVersion, blueTeamMetadata/redTeamMetadata {esportsTeamId, participantMetadata[{participantId 1-10, summonerName, championId, role top/jungle/mid/bottom/support, esportsPlayerId}]}}, `frames[]` with `rfc460Timestamp`, `gameState` (in_game|finished), `blueTeam`/`redTeam` {totalGold, inhibitors, towers, barons, totalKills, dragons[] (ocean|mountain|infernal|cloud|elder), participants[{participantId, level, kills, deaths, assists, creepScore, totalGold, currentHealth, maxHealth}]} — [openapi.yaml](https://raw.githubusercontent.com/vickz84259/lolesports-api-docs/master/openapi.yaml)
- `GET /details/{gameId}?startingTime=&participantIds=1_2_3` (underscore-separated) returns `frames[]` each with `rfc460Timestamp` and `participants[]` with additionally: totalGoldEarned, killParticipation, championDamageShare, wardsPlaced, wardsDestroyed, attackDamage, abilityPower, criticalChance, attackSpeed, lifeSteal, armor, magicResistance, tenacity, items[] (max 7 item ids), perkMetadata {styleId, subStyleId, perks[9]}, abilities[] (skill order Q/W/E/R, max 18) — [openapi.yaml](https://raw.githubusercontent.com/vickz84259/lolesports-api-docs/master/openapi.yaml)
- No x/y position, cooldown, vision or damage-totals fields appear in the documented schema (only championDamageShare) — derived from the schema in [openapi.yaml](https://raw.githubusercontent.com/vickz84259/lolesports-api-docs/master/openapi.yaml)
- Wrapper note: if the requested startingTime is after game end, `details` returns the last 10 frames — (search snippet) [@viriato/lol-esports-api](https://npmjs.com/package/@viriato/lol-esports-api)
- Riot-side characterisation (2020): the Livestats feed is undocumented, powers watch.lolesports.com, and has fewer data points than the deprecated WebSocket feed — [#260](https://github.com/RiotGames/developer-relations/issues/260). DevRel does not own the esports API — same issue.
- The spec says `getLive` is the way to detect live matches and the lolesports key/hosts are the web-client's — [openapi.yaml](https://raw.githubusercontent.com/vickz84259/lolesports-api-docs/master/openapi.yaml)

### Inferences
- The feed only covers Riot-sanctioned pro matches (esportsGameId), so it is not available for amateur/custom tournaments; it is also hosted for the consumer site, with no SLA and the key is shared, so commercial broadcast use carries licensing/ToS risk (the data is Riot IP; official commercial route is GRID).
- Uncited background (verify): window frames are timestamped in 10-second-aligned chunks and the live site runs ~30-60 s behind real time via a deliberate delay; the community usually requests startingTime offset several tens of seconds before now; schema may have evolved since the spec (alpha, last change date unknown); the full set of fields may now differ (e.g., spec says positions absent while older WebSocket feed had more).

### Gaps
- Actual delay/refresh figures not found in any read source; spec version date unknown and may be stale for 2025-26 (e.g. 2025 changes to lolesports API unverified).
- Did not verify whether the window/details endpoints still respond to the public key in Nov 2026.

---

## 6. Riot official observer/broadcast tooling and esports data partners (GRID, Bayes, PandaScore, Abios)

### Takeaway
For Riot-sanctioned events Riot distributes live game data exclusively through GRID (since the Dec 2023 deal, replacing Bayes), via riotesportsdata.com (commercial API or free-for-pro-teams data portal). Riot's in-house pro observer/Tournament Realm tooling is not publicly documented; community observer stacks (RCVolus lol-prod-toolkit, LeagueBroadcast) rely on the Replay API, LiveEvents and (now disabled) memory reading.

### Cited Findings
- Riot and GRID announced (Dec 2023) a three-year exclusive global esports data partnership for LoL and Valorant, with Riot taking an equity stake; GRID replaces Bayes Esports as exclusive real-time data distributor; live official data starting with the 2024-25 season; LoL data portal modeled on the VALORANT one — (search snippet) [sportsvideo.org](https://www.sportsvideo.org/2023/12/04/riot-games-and-grid-announce-exclusive-global-esports-data-partnership/), [gamesbeat](https://gamesbeat.com/grid-riot-games-esports-data-platform-strategic-investment/), [sbcnews](https://sbcnews.co.uk/europe/2023/12/01/riot-games-takes-equity-stake-in-grid-as-partnership-majorly-expanded/)
- Riot's data portal states GRID distributes live data directly from Riot: live in-game information, fixture data and audio/visual feeds — (search snippet) [riotesportsdata.com/league-of-legends](https://riotesportsdata.com/league-of-legends)
- GRID's LoL feature list: champion select, picks/bans, gold and XP differentials, objective control, win probability; access: real-time API integration for commercial clients, or LoL Data Portal for professional esports teams (an older article says free); contact form for access; data given to teams postgame to protect integrity — (search snippet) [grid.gg LoL](https://grid.gg/data/games/league-of-legends/), [grid.gg/get-league-of-legends](https://grid.gg/get-league-of-legends/)
- RCVolus lol-prod-toolkit/observer tool and LeagueBroadcast are the main community broadcast stacks; LeagueBroadcast "no longer functions due to Vanguard" (README) and points to a successor at bluebottle.gg; RCVolus is disabling memory reading — [LeagueBroadcast](https://github.com/floh22/LeagueBroadcast), [RCVolus](https://github.com/RCVolus/league-observer-tool)
- An accessibility/broadcast thread notes casters build overlays manually and streamers use game-memory workarounds (LeagueBroadcast) that risk bans (Jan 2022) — [#216](https://github.com/RiotGames/developer-relations/issues/216)
- A community-requested pair of internal endpoints "EsportsObserveReady" and "EsportsObserverMetadata" is suspected by one commenter to be withheld by Riot (Sep 2020, speculation) — [#216](https://github.com/RiotGames/developer-relations/issues/216)

### Inferences
- There is no public Riot "Pro HUD / Broadcast mode" SDK for third parties; official-quality data (positions, gold, damage) is only available through GRID under commercial or esports-team license, so an amateur production must combine: spectator client (observer HUD) + Replay API (camera/HUD control) + Live Client Data + LiveEvents + LCU (draft) + post-game Match-V5/Tournament-V5.
- PandaScore and Abios: no evidence found in this research on their licensing relation to Riot LoL live data (PandaScore blog snippet exists but was not readable); do not assert they are official live data partners.
- Uncited background (verify): "Tournament Realm" (TR) is a Riot-run server used by pro leagues with observer builds; Riot esports broadcasts use an internal observer toolset (Spectator client with "esports observer" mode) not distributed publicly.

### Gaps
- Could not read riotesportsdata.com / GRID pages: positions in GRID live data, licensing price/terms, "which regions currently available" are unknown.
- PandaScore/Abios licensing: not found.
- Riot Tournament Realm tooling and observer "Broadcast mode" UI: no authoritative public documentation found.

---

## 7. Riot developer policies, Vanguard, third-party restrictions, registration

### Takeaway
As of Nov 2026: Riot blocks game-memory access by unknown third-party apps (starting patch 26.20, 6 Oct 2026, per search snippets; one GitHub commenter dates the support article 29 Sep 2026), declares the official API the only permitted data source, and gives approved tools until April 2027. Live data not in the official API (gold, positions, quest state) now has no legitimate route for amateur broadcasters.

### Cited Findings
- Riot will proactively prevent game-memory access by default for unknown third-party apps in all titles (League, TFT, VALORANT); effective 6 Oct 2026 tied to patch 26.20; the change does not itself ban players; official APIs are the only permitted data route; approved tools have until April 2027 — (search snippet, multiple outlets) [lolnow.gg](https://lolnow.gg/riot-cracks-down-on-overlays-in-league-of-legends-a-long-overdue-clean-up/), [support.riotgames.com](https://support.riotgames.com/ar-ae/riot/performance/game-memory-access-removed-for-third-party-apps); a GitHub contributor cites the support article as dated 29 Sep 2026 and says developers can formally request new API data — [#1211](https://github.com/RiotGames/developer-relations/issues/1211)
- Starting 2026 Riot PC games launch through the Riot Client every time; no change to Vanguard requirements — (search snippet) [support.riotgames.com Riot Client FAQ](https://support.riotgames.com/riot/client/riot-client-faq)
- RCVolus: Riot previously said passive memory reading was allowed, but policy may change any time; with Vanguard memory reading "could result in a ban" and is being disabled — [RCVolus](https://github.com/RCVolus/league-observer-tool)
- Riot policy: overlays may not give players competitive advantage or information not available in the client; allowed overlays include static pre-game data — (search snippet) [Developer API Policy](https://support-developer.riotgames.com/hc/en-us/articles/22698698001939-League-of-Legends)
- Riot's reasoning on gold (2021): Riot may ask apps to remove features that create a competitive advantage — [#387](https://github.com/RiotGames/developer-relations/issues/387)
- Tournament API stub works with a development key; production tournament use requires approval — (search snippet) [DevRel Tournament-V5](https://riotgames.com/en/DevRel/tournament-v5-is-coming)
- Terms: API T&Cs at developer.riotgames.com/terms; general policy last updated 11 Mar 2025 — (search snippet) [policies/general](https://developer.riotgames.com/policies/general)
- Replay download cap 10/hour in patch 26.21 (see section 2) — (search snippet) [rdy.gg](https://rdy.gg/en/lol/news/lol-replays-10-hour)
- Sep 2026 side effect: spectator overlays have no official way to get role-quest state or item stacks; options are screen-reading or closed commercial tools — [#1211](https://github.com/RiotGames/developer-relations/issues/1211), [#1095](https://github.com/RiotGames/developer-relations/issues/1095)

### Inferences
- A broadcast tool that reads only the official local APIs (Live Client Data, Replay API, LiveEvents, LCU) is the compliant path; anything memory-based (Farsight-style) should be treated as banned as of Oct 2026. Screen capture/OCR of the spectator client is not memory access, but Riot's stated position on it is not covered in my sources.
- The "delay" rule: tools that expose enemy information in live (non-custom) games are restricted; spectating of ranked games is delayed; custom/tournament games spectated in-client have no mandated delay (uncited background, verify) — no source in this research states the exact current delay value.

### Gaps
- Exact official date/text of the memory-access notice (one source says 6 Oct 2026, a GitHub commenter says 29 Sep 2026 for the support article — both may be true: publication vs enforcement; unresolved).
- Production key registration steps (product registration, review, rate limit tiers): not retrieved.
- Whether Live Client Data / Replay API are explicitly on Riot's "approved API" list after Oct 2026; whether Vanguard requires anything for observers: not found.
- Nothing found on specific 2025-2026 patch-note changes to Live Client Data or Replay API beyond the memory-access and replay-download changes above.
