# Live game-data extraction for broadcast directors in other esports (comparison with League of Legends)

Research date: 2026-11-13. Method and caveats (read first):
- In this research session only github.com (plus the public Valve SDK repo via git) was reachable by WebFetch. developer.valvesoftware.com, rocketleague.com, lhm.gg, grid.gg, docs.rs and others failed DNS ("outside allowed network domains"). Most non-GitHub claims below therefore come from WebSearch result summaries (secondary, machine-summarised snippets), not from reading the primary page. Each such claim is marked "(search snippet)". Claims marked "(read directly)" come from pages or source code I opened.
- Valve's wiki page for CS:GO/CS2 GSI and the Source TV page could not be opened; the GSI field list, throttle/buffer/heartbeat parameters and the exact "observer" semantic are NOT verified here.
- Many sources are 2018-2022; the status of those endpoints in Nov 2026 is uncertain unless a date is given.

## 1. Counter-Strike (CS:GO / CS2): GSI, HLAE, HUD Manager, Valve auto-director, Scout AI

### Takeaway
CS exposes live data through an official local push mechanism (GSI: the game POSTs JSON to a URL configured in a .cfg file) that community HUD frameworks (Lexogrine HUD Manager etc.) turn into OBS/vMix browser-source overlays; HLAE is an unofficial injection tool used for camera/killfeed control. Valve's own Source-1 auto-director is a small, published, event-priority-driven algorithm (shots 4-8 s, best-of-next-8-seconds event lookahead, random fallback) that works on a deliberately DELAYED copy of the game, which is the key design idea transferable to LoL. The CS2 (Source 2) director is not public; the commercial "Scout AI" is a vendor-claimed AI observer.

### Cited Findings
GSI mechanism and data
- GSI is configured with a `gamestate_integration_<name>.cfg` file in the game's cfg folder; the game then sends JSON state to a configured local URI. The Valve wiki (Chinese mirror) describes an observer-specific config (`gamestate_integration_observerspectator.cfg`) enabling `allplayers_*` blocks (state, match stats, weapons, position); position data is noted as only available when in GOTV/observer mode (search snippet) — [Valve Developer Community, GSI (zh mirror)](https://developer.valvesoftware.com/wiki/Zh/Counter-Strike:_Global_Offensive_Game_State_Integration)
- A Valve wiki talk-page post reports the `allplayers` node being empty for some players with no explanation (search snippet; unresolved) — [Talk page](https://developer.valvesoftware.com/wiki/Talk:Counter-Strike:_Global_Offensive_Game_State_Integration)
- Maintained wrapper libraries exist for CS2 GSI (C# CounterStrike2GSI by antonpup; Rust cs2-gsi) and Dota 2 (Dota2GSI), showing GSI is a stable, widely-consumed interface — [antonpup/CounterStrike2GSI](https://github.com/antonpup/CounterStrike2GSI), [Dota2GSI](https://www.Github.com/antonpup/Dota2GSI)
- Observer HUD projects (e.g. fyflo CS2-CSGO-HUDS-Observer) put a GSI config in the CS2 cfg folder plus an observer config that strips default UI, then run a local overlay server (search snippet) — [fyflo/CS2-CSGO-HUDS-Observer-fyflo](https://github.com/fyflo/CS2-CSGO-HUDS-Observer-fyflo)

Lexogrine HUD Manager (LHM) architecture (read directly)
- LHM ingests live CS data via GSI; its REST API exposes `/api/gsi` (is the GSI file loaded) and `/api/game` (latest game data). Match score auto-updates "each time it detects end of the round"; a finished map is locked from further automatic updates. A match must be set active with its veto set up before data is gathered — [lexogrine/hud-manager](https://github.com/lexogrine/hud-manager)
- HUDs are web (React templates), rendered in a transparent window or as a Browser Source from another PC over the LAN; HUD actions can be triggered via `POST /api/huds/action/:hudDir/:action`; keybinds via `keybinds.json`; a "testing mode" feeds prerecorded match data to HUDs so they can be previewed without a game running; "LHM Signals" detects game events and triggers actions in Companion (Bitfocus) via presets; Scout AI is toggled via `/api/scout` (vision, cinematic, predict modules) — [lexogrine/hud-manager](https://github.com/lexogrine/hud-manager)
- The LHM README (as read) does not document HLAE, WebSocket transport or delay settings; a search snippet says LHM's custom killfeed requires running CS through HLAE and that it can use HLAE's built-in HUD mode (search snippet) — [lexogrine/hud-manager](https://github.com/lexogrine/hud-manager)

HLAE (read directly)
- HLAE is "a tool to enrich content creation mainly for the Counter-Strike series" (CS:GO, CS2, GoldSrc, Source, Source 2); contains per-engine hook modules (AfxHookSource, AfxHookSource2); requires Windows 10+, .NET 4.6.2+, genuine Steam; README warns it is technically a hack and joining VAC-protected servers will probably get you banned; recommends Steam offline mode so updates do not break HLAE during production — [advancedfx/advancedfx](https://github.com/advancedfx/advancedfx)
- Implication on openness: HLAE is unofficial injection, so it is tied to being on a controlled observer/GOTV client, not matchmaking, and can break on game updates.

Delay in CS: Source TV / GOTV
- Valve SDK code: `tv_delay` default 30 s ("SourceTV broadcast delay in seconds"), max `HLTV_MAX_DELAY` = 120 s; auto-director requires delay >= `HLTV_MIN_DIRECTOR_DELAY` = 10 s ("minimum delay if director is enabled"); if delay is shorter, the director just "shows next best thing" (`StartInstantBroadcastShot`) — read directly from [ValveSoftware/source-sdk-2013 hltvdirector.cpp / hltvdirector.h](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/server/hltvdirector.cpp) (commit e1f1fd42, cloned 2026-11-13; this is the Source-1 SDK, not CS2)
- Competitive CS servers commonly set `tv_delay 90` (search snippet) — [supercraft GOTV relay setup](https://supercraft.host/wiki/counter-strike-2/gotv_relay_setup/)
- An LHM HUD-replay guide assumes two GOTV feeds: one live (0 delay) and one delayed (e.g. 7 s) (search snippet) — [LHM guide, CS2 auto replay generator](https://guide.lhm.gg/docs/lhm-basics/arg-legacy/cs2-auto-replay-generator/)
- A GitHub issue reports delayed CSTV (tv_delay 7) only stayed connected reliably with `+sv_deltaticks_enforce 0` (search snippet) — [joedwards32/CS2 issue 194](https://github.com/joedwards32/CS2/issues/194)

Valve's auto-director algorithm (Source 1 SDK; read directly from source) — [hltvdirector.cpp](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/server/hltvdirector.cpp), [hltvdirector.h](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/server/hltvdirector.h)
- Architecture: director listens to game events (`player_hurt`, `player_death`, `round_start`, `round_end`, `hltv_cameraman`, `hltv_rank_entity`, `hltv_rank_camera`), stamps each with tick and a `priority` field read from the event ("priorities are leveled between 0..10, -1 means ignore"; event definitions in `resource/hltvevents.res`), and stores them in a tick-ordered history. Because the broadcast runs `tv_delay` seconds behind the game, the director "sees the future" relative to what it is currently showing.
- Shot timing constants: MIN_SHOT_LENGTH 4 s, MAX_SHOT_LENGTH 8 s, DEF_SHOT_LENGTH 6 s. If less than MIN time remains before an interrupt, the current shot is extended rather than cutting.
- `FindBestGameEvent()`: scans the delayed broadcast timeline in four windows ending at +2, +4, +6, +8 s, keeps the highest-priority event per window, then applies cut rules: if the 4 s-window best priority >= the others, take it ("best case", gives ~2 s of lead-in before the event); else if the 2 s event is strictly more important than the 4 s and 6 s ones, take it ("very important"); else if the 6 s event beats the 8 s one, take it; else show the 2 s event if any. If no event has priority, return NULL and fall back to a random shot.
- `CreateShotFromEvent()`: for kills/hurts, randomised chase cam vs in-eye (about 67% in-eye for kills, 33% for hurts), often swapping victim/attacker, random left/right shoulder offset; shot ends at most 2 s after the event; self/world deaths get a chase cam on the victim; round start/end use the best fixed (level) camera.
- Fallback `StartRandomShot()`: with 25% probability (and `tv_allow_static_shots` on) pick a fixed level camera, else follow a player (`StartBestPlayerCameraShot`).
- Ranking of fixed cameras (`AnalyzeCameras`) and of players (`AnalyzePlayers`): for each candidate, sum over visible players within 1024 units (line-of-sight trace) of (1/sqrt(distance)) * WeightedAngle(facing), then multiply by |sum of direction vectors| / N (a "distribution" term that favours clustered, converging action). Results are published as `hltv_rank_camera` / `hltv_rank_entity` events.
- Human override: a spectator can become "camera man" (`tv_allow_camera_man`); a `hltv_cameraman` event always interrupts the auto-director; the Valve wiki says the camera is usually controlled by the auto-director and a spectator who takes manual control can hand it back by pressing USE again (search snippet) — [Valve Dev Wiki, SourceTV](https://developer.valvesoftware.com/wiki/Stv)
- Team Fortress 2 subclass only adds mod events to relay (control point, flag, round win etc.) — [tf_hltvdirector.cpp](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/server/tf/tf_hltvdirector.cpp)

Commercial CS2 auto observer: Scout AI (LHM)
- Scout AI = Scout Vision (observing/POV choice), Scout Predict (round predictions), Scout Cinematic (successor to "Auto Cinematic Observer"); action cinematics introduced in LHM 5.1.0; computation runs on LHM's backend and is metered (2 h Personal, 20 h Professional, 8 h per seat Enterprise per LHM guide); setup is a toggle; claims 50% performance improvement in 2.0. All vendor-reported, no independent test found (search snippet) — [LHM Scout AI](https://lhm.gg/features/scout-ai), [LHM guide](https://guide.lhm.gg/docs/lhm-basics/scout-ai-for-cs2/), [LHM 4.12.0 notes](https://lhm.gg/blog/lhm-4-12-0-release-notes)

### Inferences
- Valve's design separates three layers: (a) game events with designer-assigned priority 0-10; (b) a spatial "ranker" (distance, facing, clustering) for who/where to show when nothing important is queued; (c) a timing policy (4-8 s shots, lookahead windows, min-delay 10 s). All three can be reproduced for LoL using fed data (kills, objectives, teamfights, positions) as long as the program feed is delayed, which is already the case on a LoL spectator client/broadcast.
- The "lookahead over delayed timeline" trick is the most transferable idea: a LoL director tool that holds data N seconds ahead of the video can pre-cut to a fight before it appears on screen, instead of reacting late.
- GSI-style local HTTP push + a framework that hosts HTML HUDs as browser sources (LHM) is the dominant community pattern; LoL equivalent frameworks (e.g. RCVolus league-prod-toolkit) are structurally similar.
- Source-1 SDK algorithm may differ from CS2's current closed-source director; CS2 behaviour was not verified.

### Gaps
- Official GSI field list, `throttle`/`buffer`/`heartbeat`/`timeout` semantics and whether GSI data in observer mode is delayed relative to GOTV: Valve wiki not reachable; one search could not find any source explaining GSI timing vs tv_delay.
- Whether CS2's own `tv_autodirector`/`spec_mode auto` uses the same algorithm as the Source-1 SDK: not verified; the convar name `tv_autodirector` was not confirmed.
- HLAE websocket features (mirv_pgl, mirv script, `mirv_*` camera commands): README fetched did not cover them; not verified.
- No independent evaluation of Scout AI.

## 2. Dota 2: GSI, Dota TV, tournament feeds, overlay tools

### Takeaway
Dota 2 has the same GSI mechanism (local cfg + launch option), but the observer-grade data (all players) is thinly documented in what I could access; spectator video/data for tournaments goes through Dota TV with a heavy mandatory delay, and overlay-oriented community tools exist but are small.

### Cited Findings
- Dota 2 GSI: config file `game/dota/cfg/gamestate_integration/gamestate_integration_<name>.cfg`, title block, `uri` (e.g. http://localhost:4001/), `timeout` (e.g. 5.0), `buffer` (e.g. 0.1); requires the `-gamestateintegration` launch option; cfg changes need a restart (search snippet) — [Dota2GSI (antonpup)](https://www.Github.com/antonpup/Dota2GSI), [Overwolf: enable GSI for Dota 2](https://support.overwolf.com/support/solutions/articles/9000212745-how-to-enable-game-state-integration-for-dota-2)
- `dota2-cast-assist` targets broadcasters/spectators: begins capturing live match data when you start watching a game and exposes it through a REST API (search snippet; small project) — [data-mission/dota2-cast-assist](https://github.imc.re/data-mission/dota2-cast-assist)
- Delay: private lobbies can use 10 s or 2 min spectator delay (Dota 2 wiki); a patch added an automatic 15-minute Dota TV delay option for tournament lobbies (date not found) (search snippet) — [Cybersport.ru on auto delay in Dota TV](https://www.cybersport.ru/dota-2/news/valve-dobavila-avtomaticheskuyu-zaderzhku-v-dota-tv)
- Valve's community stream policy lets organisers require "a slight delay" from community streamers using the Dota TV feed (search snippet) — [Dota 2 community stream policy](https://www.dota2.com/dotatv)
- Dota Plus gives zero-delay friend spectating only under conditions; otherwise "Watch Game" has a delay (search snippet) — [theglobalgaming](https://theglobalgaming.com/dota-2/dota-2-how-to-watch-friends-live-game)
- Stratz documents a live-matches pipeline (third-party) — [Stratz, Dota 2 Live Matches](https://medium.com/stratz/dota-2-live-matches-639021bede36) (not read in detail)

### Inferences
- Dota's model (local push for the client, long mandatory delay for the public feed) mirrors LoL spectator delay; data pipelines that need to be real-time for the director must come from the production-side observer client, not the public feed.

### Gaps
- Observer-specific GSI fields in Dota 2 (full-map hero positions, etc.), Game Coordinator live-league feed details, and how big Dota productions (PGL, ESL) wire overlays: no reliable source found.
- Valve auto-director equivalents in Dota (DotaTV uses an auto camera, details not found).

## 3. Valorant and Riot-side tooling

### Takeaway
Valorant has no public official observer data API; production overlays rely on (a) Riot's internal broadcast tooling (not public), (b) GRID as the official commercial data partner, and (c) community systems using Overwolf data from an observer client (Spectra) plus LHM's premium Valorant HUD.

### Cited Findings
- Spectra: three components: Client (runs on a single in-game observer's machine, forwards the game data Overwolf provides to the server), Server (reconstructs the game state), Frontend overlay (pulls game state at a 100 ms interval and displays it as a broadcast overlay). README read says nothing on OBS integration or delay handling — [ValoSpectra/Spectra-Client](https://github.com/ValoSpectra/Spectra-Client) (read directly)
- Overwolf forum: no way to get health/armor/ultimate updates of other players when the local player has an observer role (so Overwolf-based observer data is limited) (search snippet; date unknown, may be outdated) — [Overwolf forum](https://discuss.overwolf.com/t/valorant-events-for-other-players-and-getting-health-armor-and-ultimate-status/2677)
- GRID describes itself as the official data partner for tier-1 Valorant tournaments, with real-time data and sub-200 ms latency, for broadcast overlays; a 2024 article describes a Valorant live-data API "at broadcast speed" in a Tracker Network partnership (search snippet; vendor claims) — [GRID Valorant](https://grid.gg/data/games/valorant/), [European Gaming, 2024-08-14](https://europeangaming.eu/portal/latest-news/2024/08/14/165113/grid-esports-powers-tracker-networks-new-valorant-esports-experience-with-official-data/)
- GRID Stream offers a broadcast-synced mode (~30 s) and a faster-than-broadcast mode (~5 s) (search snippet) — [GRID Stream](https://grid.gg/products/stream/)
- RCVolus league-prod-toolkit (LoL, also had a Valorant module, unmaintained since March 2023): dedicated server; observer PCs running a companion Observer Tool send game data; overlays are browser sources in OBS/vMix; README states that removal of LiveEvents API and introduction of Vanguard affect in-game features (level-ups, item purchases, killfeed, inhibitor timers expected to work); spectator delay mentioned only in passing (rune overview fills the delay time) — [RCVolus/league-prod-toolkit](https://github.com/RCVolus/league-prod-toolkit) (read directly)
- LHM sells a Valorant "Premium HUD" for observers (search snippet) — [LHM Valorant HUD](https://lhm.gg/features/premium-hud/valorant)

### Inferences
- The Spectra pattern (one observer client -> central state-reconstruction server -> overlay polling at 100 ms) is the same shape as RCVolus for LoL and is the reference architecture for a single-observer-PC data source.
- When the game publisher offers no open feed, the community uses the observer client as the sensor; fields are bounded by what that client reveals.

### Gaps
- Riot's own Valorant esports spectator tooling and official data feed to partners: no public documentation found. Riot LoL-specific docs are covered by other researchers.

## 4. Rocket League: Stats API and SOS plugin

### Takeaway
Rocket League is the closest to a "good" official solution: Psyonix ships a client-side Stats API (local socket, configurable packet rate up to 120/s, event messages), which community bridges relay to WebSocket for OBS browser-source overlays; the older BakkesMod "SOS" plugin was the de facto overlay standard before it.

### Cited Findings
- Official Stats API: local port default 49123 (0 disables; must differ from WebPort); `PacketSendRate` float default 0 (disabled), number of UpdateState packets broadcast per second, capped at 120 (search snippet of official page) — [Rocket League Stats API](https://www.rocketleague.com/en/developer/stats-api)
- Transport conflict: official page treats it as a websocket-style feature, community sources say current builds expose a plain TCP socket streaming concatenated JSON, not WebSocket; port 49122 WebSocket comes from third-party bridge (rlstatsapi), input 127.0.0.1:49123, output 0.0.0.0:49122 (search snippet) — [rlstatsapi docs](https://docs.rs/crate/rlstatsapi/latest), [pkgstats](https://www.pkgstats.com/pkg:rocket-league-stats-api)
- Patch notes v2.72 (dated Aug 4, 2026 in snippet) reportedly list WebSocket support for the Stats API and the ability to send commands to the game (search snippet; needs verification) — [Rocket League patch notes v2.72](https://www.rocketleague.com/news/rocket-league-patch-notes-v2-72)
- Messages are JSON "Event"+"Data" envelopes: periodic `UpdateState` (full game/player snapshot: Players, Ball with Speed/TeamNum, Elapsed, bReplay, bHasWinner, Winner, Arena) and discrete events such as `BallHit` (sent one frame after the hit; includes MatchGuid, Players, Ball) and `GoalScored` (search snippet; schema not fully verified) — [official Stats API page](https://www.rocketleague.com/en/developer/stats-api), [community reference](https://manucabral.github.io/rlstatsapi/events/)
- Overwolf forum reports own-goals do not send a goal event (search snippet) — [Overwolf dev forum](https://discuss.developers.overwolf.com/t/rocket-league-own-goals-do-not-send-a-goal-event/397)
- Data flow example: Rocket League -> RL Overlay Hub (reads rlstatsapi) -> WebSocket -> HTML overlay -> OBS Browser Source; `@zipsesports/sos-wrapper` is an npm wrapper for the SOS WebSocket; SOS has a rebroadcasting relay (search snippet) — [RL Overlay Hub docs](https://manucabral.github.io/rl-overlay-hub/), [awesome.ecosyste.ms entry](https://awesome.ecosyste.ms/projects/github.com%2Fmanucabral%2Frl-overlay-hub)
- The ggrecon article "How custom overlays became the biggest talking point of the Community Takeover" discusses community overlays in RLCS broadcasts (could not be opened) — [ggrecon](https://ggrecon.com/articles/how-custom-overlays-became-the-biggest-talking-point-of-the-community-takeover)

### Inferences
- A publisher-official, rate-configurable local feed + community relay-to-WebSocket is the cleanest pattern in this survey; the data are unthrottled "client truth", so the delay problem (below) still has to be solved by the production side.
- Rocket League events carry `bReplay` in state, which lets an overlay suppress or re-label data during replays, relevant to LoL replay segments.

### Gaps
- Complete event list, rates in practice, and whether the SOS plugin is still maintained in 2026: no direct read.
- Whether RLCS production uses these feeds directly (versus Psyonix internal tooling): not found.

## 5. Other games: Overwatch, Apex, Fortnite, StarCraft II, TFT

### Takeaway
Elsewhere the pattern is: no open live-data API; professional broadcasts rely on proprietary observer clients (Overwatch, Apex), or on a client API for production tools (StarCraft II); public-facing "stats lab" style data is post-hoc, not live.

### Cited Findings
- Overwatch League: observer clients moved to the cloud ("Project Aloha", 2021) by Activision Blizzard's Broadcast Technology Group — [SVG Europe/Sports Video Group, 2021-04-16](https://www.sportsvideo.org/2021/04/16/activision-blizzards-overwatch-league-efforts-dive-deeper-into-the-cloud-head-to-hawaii-for-project-aloha/) (search snippet)
- OWL expanded stats API was exposed accidentally in 2018 and turned off; remaining API offered seven stats; Stats Lab went public in 2020; Overwatch League Replay Viewer let fans use observer-style cameras (search snippet) — [Kotaku](https://kotaku.com/blizzard-accidentally-gives-fans-access-to-treasure-tro-1827764316), [Sports Video Group, 2020-02-05](https://www.sportsvideo.org/2020/02/05/overwatch-league-unveils-new-stats-lab-beta-before-2020-season/), [Blizzard Replay Viewer](https://overwatch.blizzard.com/en-us/news/23013835/)
- Apex/ALGS: an inventory overlay for spectators is ALGS-only and not available to players in the tournament build; EA forum posts mention a "Live API" found in game files (unofficial); Multiview on the official Twitch channel debuted January 2023 (search snippet) — [Sportskeeda](https://www.sportskeeda.com/esports/apex-legends-fans-want-algs-only-feature-added-battle-royale), [EA forum](https://forums.ea.com/discussions/apex-legends-general-discussion-en/live-api-2-0/5668665), [Fragster](https://www.fragster.com/new-multiview-option-on-playapexs-official-twitch-channel/)
- StarCraft II: Blizzard added custom observer interfaces (UI files in Documents\StarCraft II\Interfaces) in Heart of the Swarm; the StarCraft Casting Tool reads scores via the SC2 Client API (player order may differ from the Observer UI and swap the score); `SC2AutoObserver` (C++) is an automatic replay observer used for 24/7 AI Arena livestream — [PC Gamer](https://www.pcgamer.com/uk/custom-starcraft-ii-observer-interfaces-coming-in-heart-of-the-swarm), [StarCraft Casting Tool](https://github.com/teampheenix/StarCraft-Casting-Tool), [cpp-sc2/SC2AutoObserver](https://github.com/cpp-sc2/SC2AutoObserver) (search snippets)
- Fortnite and TFT: no usable sources found.

### Inferences
- For games without a public feed, community tooling attaches to the observer client; the director's real data source is almost always "an observer PC that sees more than the public".

### Gaps
- Fortnite observer/replay tooling, TFT live data (Riot Match v5 / client), Overwatch 2 observer data in 2026, Apex ALGS data pipeline details: not found.

## 6. Academic / automated director work

### Takeaway
Published academic auto-observers focus on StarCraft (vision/learning of human camera behaviour) and a 2026 LoL camera paper; Valve's algorithm is not academic but is the only widely deployed rule-based director that is open for inspection.

### Cited Findings
- GIST: Mask R-CNN-based automatic spectating for StarCraft trained on human viewport data, Expert Systems with Applications 2022; claims to outperform rule-based methods and human observers (search snippet) — [ESWA AO PDF](https://cilab.gist.ac.kr/hp/wp-content/uploads/publications/international_journal/2023/ESWA_AO.pdf), [TechXplore, 2022-11](https://techxplore.com/news/2022-11-intelligent-esports.html)
- GIST follow-up: hierarchical scene detection and tracking with a Vision Transformer, Scientific Reports 2025, DOI 10.1038/s41598-025-93692-0, compared against six observer models on accuracy and camera stability (search snippet) — [Scientific Reports via mirror](https://library.kab.ac.ug/Record/doaj-art-7d9d9c73fef3419385f619ee2e776a27/Description)
- Bae et al. 2025 open-source "Observer" framework on BWAPI for StarCraft (search snippet) — [GIST PDF](https://scholar.gist.ac.kr/bitstream/local/32302/2/1_s2.0_S2352711025003875_main.pdf)
- Narayanan et al., IJIMAI 2026: AI commentary and spectator camera control for League of Legends, 2D Conv-LSTM vs 3D CNN for predicting camera movement (search snippet) — [UNIR repository](https://reunir.unir.net/items/e9162a95-1607-4872-95be-b5ad8d63606e/full)
- General sports automatic-directing literature (Disney Research "Computational Sports Broadcasting", Smart Director arXiv 2201.04024) appears in the search but is not esports-specific — [Disney Research](https://studios.disneyresearch.com/2013/07/15/computational-sports-broadcasting-automated-director-assistance-for-live-sports/), [arXiv 2201.04024](https://arxiv.org/abs/2201.04024)

### Inferences
- The LoL IJIMAI 2026 paper and the StarCraft work are the closest academic comparisons to the LoL scenario; but I only saw abstracts, so quality and applicability remain unverified.

### Gaps
- Nothing found on Dota/CS academic auto-directors. Did not read any paper in full.

## 7. General architecture patterns for live esports data pipelines

### Takeaway
Across games the same pipeline recurs: game/observer client (producer) -> local or central bridge that normalises/rebuilds state -> WebSocket/HTTP/SSE -> HTML overlay in an OBS/vMix browser source, with a central relay server for multi-machine productions and an operator control surface (REST/keybinds/Companion).

### Cited Findings
- Producer -> local HTTP server (GSI POST) -> HUD manager with REST API -> web HUD in transparent window/browser source over LAN; Companion triggers from game events — [lexogrine/hud-manager](https://github.com/lexogrine/hud-manager)
- Producer (observer PC client) -> central server reconstructing state -> overlay polling every 100 ms — [Spectra-Client](https://github.com/ValoSpectra/Spectra-Client)
- Producer (observer PC tool) -> dedicated production server -> OBS/vMix browser sources, with lower-thirds/scoreboards — [RCVolus/league-prod-toolkit](https://github.com/RCVolus/league-prod-toolkit)
- Game TCP socket -> relay -> WebSocket -> HTML overlay -> OBS Browser Source (Rocket League) — [RL Overlay Hub](https://manucabral.github.io/rl-overlay-hub/)
- Cloud-style consumer pipeline for a prediction product: CS2 GSI -> backend -> Redis Streams -> worker -> Redis Pub/Sub -> API SSE -> frontend, with server-side buffering for the streamer's delay (search snippet; non-broadcast use) — [DEV: "How I synced real-time CS2 predictions with Twitch stream delay"](https://dev.to/elomarket/how-i-synced-real-time-cs2-predictions-with-twitch-stream-delay-53lg)
- Test-data replay ("testing mode") to rehearse HUDs without the game — [lexogrine/hud-manager](https://github.com/lexogrine/hud-manager)

### Inferences
- A LoL production system should include: a recorded-feed replay mode; a state-reconstruction layer (events + snapshots) so overlays can reconnect and get the full state; and idempotent overlays (render from state, not from event deltas).

### Gaps
- No primary source on CasparCG integration for any of these games; vMix is mentioned only for RCVolus.

## 8. Production-side knowledge: delay/sync, failover, operator override

### Takeaway
Game data is usually earlier than program video; the standard remedy is to delay the data (or add the delay at the source) to match the video, or in the other direction to run a "ahead-of-broadcast" mode for betting/second-screen uses. Evidence on failover/operator override in esports overlays is thin.

### Cited Findings
- Organisers add broadcast delay mainly to prevent stream sniping/ghosting; PandaScore suggests aligning the delay of the video stream with the delay of the data feed — [SBC News, 2021-07-27](https://sbcnews.co.uk/europe/2021/07/27/how-latency-stream-delay-work-esports/), [PandaScore, 2021-06-28](https://www.pandascore.co/blog/what-role-does-latency-play-in-esports-betting), [Abios](https://abiosgaming.com/press/stream-delay-esports-betting/) (search snippets)
- GRID says its data comes straight from the game server without broadcast delay; GRID Stream has broadcast-synced (~30 s) and faster (~5 s) modes configurable per surface (search snippet) — [GRID Stream](https://grid.gg/products/stream/)
- Valve's director design: operates on a deliberately delayed timeline (default 30 s, min 10 s for director) so cuts can anticipate events — [hltvdirector.cpp](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/server/hltvdirector.cpp)
- Delayed game-state replay system: LHM replay guide uses a 0-delay GOTV for data plus a 7-second-delayed GOTV for video-side replays (search snippet) — [LHM guide](https://guide.lhm.gg/docs/lhm-basics/arg-legacy/cs2-auto-replay-generator/)
- RCVolus: in the spectator delay, the rune overview is shown because only the game is live; some features unavailable on the Tournament Realm — [league-prod-toolkit](https://github.com/RCVolus/league-prod-toolkit)
- Spectra overlays poll the server state at 100 ms; no delay mechanism described — [Spectra-Client](https://github.com/ValoSpectra/Spectra-Client)
- Operator override: Valve's camera-man mechanism always interrupts the auto-director and can be handed back; LHM exposes HUD actions via REST and keybinds and Companion triggers; Scout AI can be toggled via API — [hltvdirector.cpp](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/server/hltvdirector.cpp), [lexogrine/hud-manager](https://github.com/lexogrine/hud-manager)
- Fragility: HLAE recommends Steam offline mode to avoid updates breaking production; delayed CSTV needed a netcode workaround — [advancedfx](https://github.com/advancedfx/advancedfx), [CS2 issue 194](https://github.com/joedwards32/CS2/issues/194)

### Inferences
- Likely best practice (my synthesis, not a single source): timestamp all events at ingest; hold them in a ring buffer; release at (video latency) with a calibrated, operator-adjustable offset (e.g. +/- hotkeys) and a clap/flash calibration; keep a "live/no delay" mode for director-assist, and "program-synced" mode for graphics. Valve's design shows the automated director should operate on the un-delayed side and the graphics on the delayed side.
- Failover: because overlays render from reconstructed state, a "data stale" watchdog (no packet for N ms) should hide dynamic graphics or switch to static/manual mode; overrides such as camera-man hand-back and manual toggles are the Valve/LHM precedent. No published esports source describes a formal failover design.

### Gaps
- No primary-source production talk found about overlay data timing calibration, failover on data loss, or operator panel designs (e.g. from ESL, BLAST, Riot). The "delay queue" method above is NOT confirmed by any source I found (the search tool said the same).
- CasparCG integrations for these games: none found.

## Summary of transferable lessons for LoL (flagged as inference)
1. Publisher-supported local feed + community WebSocket relay (Rocket League, CS GSI) is the ideal; LoL's equivalent has to be built from the observer client (Spectra/RCVolus pattern).
2. Valve's director: designer-assigned event priorities (0-10), 4-8 s shots, +2/+4/+6/+8 s lookahead on a delayed timeline, 25% random static shots / 75% follow player fallback, ranking = sum(1/sqrt(dist) x facing) x clustering factor, hard interrupt by human camera man. A LoL analogue: priority table for kills/objectives/fights/recalls, cluster-based ranking of champions for "no event" fallback, minimum shot length, operator takeover.
3. Run the director on the earliest data and the overlays on the delayed copy; make the delay explicit and adjustable.
4. Build replay/test mode, stale-data detection and idempotent state-based overlays.
5. Third-party commercial feeds (GRID) offer both broadcast-synced and ahead-of-broadcast modes, a model for latency tiers.
