# Herramientas de terceros y comunitarias para extracción de datos LoL en producción (research date: 2026-11-13)

Scope note: the session network blocked several hosts (dev.overwolf.com, www.riotgames.com, www.pandascore.co, riotesportsdata.com, eprints.whiterose.ac.uk, www.ijimai.org). Anything from those hosts is only what appeared in search-result snippets (marked "snippet-only"). GitHub star/date figures come from the GitHub search API (`api.github.com/search/repositories`) unless noted.

## 1. Open-source broadcast/overlay frameworks for LoL

### Takeaway
The best-known community stack (RCVolus lol-prod-toolkit + observer tool, floh22/LeagueBroadcast) relied on passive memory reading, which broke or was disabled with Riot Vanguard. The living projects found are small (0-5 stars) and use the official Live Client Data API (local, port 2999) plus manual/admin-panel input, delivering to OBS as browser sources over WebSocket/HTTP.

### Cited Findings (VERIFIED against README/API unless marked)
- **floh22/LeagueBroadcast** — C#/.NET backend with an npm-built frontend; 222 stars; last push 2025-05-20; README marks it deprecated because in-game mode "no longer functions due to the introduction of Vanguard"; no releases published; data came from memory reading (Farsight, per-patch offsets), Live Events + Replay API, DataDragon; features: level-up/item indicators, baron/elder timers with power-play popups, dynamic gold graph, CS/EXP/gold tab, scoreboard, inhibitor timers, pick/ban; OBS via two browser sources on localhost:9001 (in-game URL and pick/ban URL with WebSocket backend at /api); default branch v2, 246 commits — [GitHub repo](https://github.com/floh22/LeagueBroadcast); stars/date from [GitHub search API](https://api.github.com/search/repositories?q=league+of+legends+overlay+broadcast&sort=stars&per_page=30)
- **RCVolus league-observer-tool** (part of "lol-prod-toolkit") — queries local LCU, in-game data, LiveEvents API (dragon/baron/herald kills, turret plate destruction), Replay API for time control; sends data to a local or remote toolkit instance with IP/port/optional auth key; passive memory reading (Farsight-based) is disabled since Vanguard ("could result in a ban"); needs `[LiveEvents] Enable=1 Port=34243` in game.cfg; README does not mention OBS directly (OBS integration is via the toolkit) — [README](https://www.github.com/RCVolus/league-observer-tool); config detail from search snippet. Repo metadata (stars/last commit) could not be retrieved (403); the toolkit repo URL guess `RCVolus/lol-prod-toolkit` returned 404, so the toolkit's current location is UNVERIFIED.
- **Riot's Vanguard FAQ** (snippet-only): overlays/tools using the API, game client and in-game APIs should continue to function, external memory-reading tools will not, and apps using the spectator and replay services should still work — [Riot Vanguard FAQ](https://www.riotgames.com/en/DevRel/vanguard-faq) (host blocked; text from search snippet)
- **jyaniee/league-studio** — TypeScript; React+Vite overlay, Node.js `ws` WebSocket server (default port 8081), pnpm monorepo, WPF Observer tool, player-side Agent; data: Live Client Data API from the spectator view as main source, plus Agent fills Dragon/Baron/Herald/Void Grub events the spectator view may miss, plus operator-entered data; merges into one `GameState` broadcast over WebSocket; overlay is an OBS Browser Source; features scoreboard, kills/gold, objectives, KDA/CS/items/ward status; in development; 1 star, last push 2026-11-09 — [README](https://raw.githubusercontent.com/jyaniee/league-studio/main/README.md); [GitHub search API](https://api.github.com/search/repositories?q=league+of+legends+overlay+broadcast&sort=stars&per_page=30)
- **Dachers/league-spectator-hud** — JavaScript; uses Live Client Data API; admin panel, objective tracking, broadcast overlays; README does not state OBS method or status; 0 stars, last push 2026-08-05 — [README](https://raw.githubusercontent.com/Dachers/league-spectator-hud/main/README.md); [search API](https://api.github.com/search/repositories?q=league+of+legends+overlay+broadcast&sort=stars&per_page=30)
- **McJanrey/Chud-Hud-Manager** — Electron + Node.js + plain HTML/SVG overlays, Tesseract OCR for other games; multi-game (LoL via Live Client Data API with estimated gold and objective timers); outputs: overlay browser source at `http://localhost:7777/overlay?scene=auto&event=<id>`, CSV/JSON/XML data refreshed every second for vMix/GT Title Designer, `POST /api/ingest`, Stream Deck/Companion links; v0.3.1+; 2 stars, last push 2026-10-30; licensing via Supabase — [README](https://raw.githubusercontent.com/McJanrey/Chud-Hud-Manager/main/README.md); [search API](https://api.github.com/search/repositories?q=league+of+legends+overlay+broadcast&sort=stars&per_page=30)
- **kerembayraktar0/lol-pickban-overlay** — Node.js + WebSockets + LCU; pick/ban only; 1 star, last push 2026-09-03 — [search API](https://api.github.com/search/repositories?q=league+of+legends+overlay+broadcast&sort=stars&per_page=30) (README not read)
- **finncyr/ECO_LoL_Overlay_serverless** — CSS, serverless overlay as OBS browser source; 5 stars, last push 2023-03-25 — [search API](https://api.github.com/search/repositories?q=league+of+legends+overlay+broadcast&sort=stars&per_page=30); description from [search snippet](https://www.github.com/eSports-Cologne-Dev/ECO_LoL_Overlay_serverless)
- **NormalPlayerJSH/lol-banpick-observer** — JavaScript pick/ban tool; 26 stars, last push 2022-06-12 — [search API](https://api.github.com/search/repositories?q=league+of+legends+observer+spectator&sort=updated&per_page=30)
- **Dan-Shields/League-OCR-HUD** — Node.js >=15, Windows, NDI x64 runtime; combines Game Client API with Google Cloud Vision OCR of a 1920x1080 NDI feed to fill gaps (gametime, towers, kills, gold, drakes, heralds, baron/drake timers); writes one .txt per value (e.g. `left_gold.txt`) for OBS/vMix; 40 stars, 5 forks; last commit date not shown (45 commits) — [GitHub](https://github.com/Dan-Shields/League-OCR-HUD)
- **Live Client Data API (local)**: endpoints `/liveclientdata/allgamedata` and `/liveclientdata/eventdata` at `https://127.0.0.1:2999`; allgamedata bundles active player, all players, events, game stats; only available while a game is in progress — wrapper docs: [Go wrapper](https://pkg.go.dev/github.com/breadinator/lolapi/clientapi), [Rust irelia](https://docs.rs/crate/irelia/0.11.2/source/src/in_game.rs), [lol-client-mcp](https://glama.ai/mcp/servers/johnnyinlee/lol-client-mcp) (third-party descriptions, not Riot's page; Riot docs at developer.riotgames.com/docs/lol#game-client-api were not retrieved)
- Other repos seen only in search snippets (UNVERIFIED details): Sky-CSC/OSL "Overlay Spectator Live" (champ-select spectating overlay, MIT) [site](https://sky-csc.github.io/OSL); solitudera/lol-esports-broadcasting-guide (OBS guide/toolkit) [listing](https://awesome.ecosyste.ms/projects/github.com%2Fsolitudera%2Flol-esports-broadcasting-guide); pchz/AcheronObs [listing](https://relatedrepos.com/gh/pchz/AcheronObs).

### Inferences
- A director-facing app today realistically needs: Live Client Data API (spectator client) for state/events + manual/admin input + WebSocket to OBS browser sources; the league-studio architecture (Agent + Observer + Server + Overlay) is the closest current open-source analogue.
- Memory-reading is a dead end after Vanguard; objective events not exposed by the Live Client API (e.g. void grubs, plates) are a known gap that these projects patch via agents/LiveEvents.

### Gaps
- No repo/last-commit data for RCVolus tools (403/404). The successor to LeagueBroadcast (README points to a Discord/site) was not identified.
- Not searched in depth: lolesports-feed-based overlays, CasparCG/Singular.live/TriCaster pipelines for LoL, and `lol-prod-toolkit` details.

## 2. Commercial tools and platforms

### Takeaway
Overwolf's GEP exposes League data (including `live_client_data` keys) to apps, but its docs could not be fetched; official live esports data is distributed exclusively via GRID. Broadcast-graphics vendors and Stream Deck/Streamer.bot integrations were not covered.

### Cited Findings
- Overwolf LoL GEP page lists the `gep_internal` feature and points to the general game-events docs; LoL, LoL Arena and LoL Swarm share Game ID 13956 — [Overwolf LoL docs](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/league-of-legends), [Swarm](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/league-of-legends-swarm) (snippet-only)
- `live_client_data` keys: `active_player`, `all_players`, `events`, `game_data` (since GEP v143.1), `port` (added v155.0) — [Overwolf LoL docs](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/league-of-legends) (snippet-only; full event/match_info tables not retrieved)
- Overwolf intro warns data issues are likelier the longer between game start and GEP registration, and events may become temporarily unavailable; no measured latency published in what was retrieved — [GEP intro](https://dev.overwolf.com/ow-native/live-game-data-gep/live-game-data-gep-intro) (snippet-only)
- Forum report that Riot moved the live API port from 2999 to a random port, with a workaround via process list — [Overwolf forum](https://discuss.overwolf.com/t/lol-live-client-data-event-not-sending-updates/974) (UNVERIFIED, may be outdated; note the 2999 port is still documented by wrappers above)
- GRID is Riot's exclusive global esports data distribution partner (announced Dec 2023); LoL coverage includes champ select, picks/bans, live game state, gold/XP differentials, objectives, win probability; REST + WebSocket API and SDK (one source also Kafka); archives; commercial clients via API, teams via LoL Data Portal with postgame distribution — [SVG announcement](https://www.sportsvideo.org/2023/12/04/riot-games-and-grid-announce-exclusive-global-esports-data-partnership/), [GRID LoL](https://grid.gg/data/games/league-of-legends/), [GRID live data](https://grid.gg/products/live-data/), [Riot esports data](https://riotesportsdata.com/league-of-legends) (marketing pages, snippet-only)
- PandaScore published a "LoL live data API guide" blog dated Jul 30, 2026 — [PandaScore blog](https://www.pandascore.co/blog/lol-live-data-api-pandascore-guide) (host blocked; content not read)
- Mobalytics stated Vanguard would affect ~1% of third-party apps — [Mobalytics](https://mobalytics.gg/?p=69932) (snippet-only)

### Inferences
- For a broadcast director without GRID access, Live Client Data API (in the spectator client) is the only legitimate low-latency in-game source; GRID/PandaScore are the commercial alternatives for tournament-grade data but gated.

### Gaps
- Overwolf event list (kills, level, gold, abilities), latency numbers and policies: not retrieved. Overlay apps Blitz/OP.GG/Porofessor/Outplayed/Insight.gg: not researched.
- Streamlabs/StreamElements/Streamer.bot, Stream Deck plugins, Vizrt, Singular.live, Ross, vMix GT, Abios, Bayes, Toornament/Battlefy/Challengermode/Start.gg, Oracle's Elixir, Leaguepedia: not researched (tool-call budget).

## 3. Observer-assist, AI-director and computer-vision approaches

### Takeaway
No production "AI observer" tool for LoL was found; only academic prototypes and Riot's manual camera reference tool. CV on minimap/OCR exists as datasets and papers, and highlight detection has peer-reviewed work.

### Cited Findings
- **League Director** (RiotGames/leaguedirector) — Riot's Windows-only reference implementation of the Replay API; Python 3.10 + PySide6; playback/speed control, first-person camera attach to champion/minion, HUD toggles, keyframe sequencer, WebM/PNG capture; ~1.0k stars, 161 forks, Apache-2.0; PRs not accepted; last commit date not shown (copyright 2026) — [GitHub](https://github.com/RiotGames/leaguedirector). Replay API needs `EnableReplayApi=1` in game.cfg.
- **breadcam** — fork of League Director, 0 stars, no automation beyond keyframes — [GitHub](https://github.com/Jadiac5/breadcam)
- IJIMAI paper "AI Powered Commentary and Camera Direction in E-Sports": autonomous commentary + spectator camera control for LoL using GPT-4o with Vision and OpenAI TTS; authors flag commentary/camera synchronisation as a challenge — [IJIMAI](https://www.ijimai.org/index.php/ijimai/article/view/6566) (snippet-only)
- GIST 2025 paper: replay + API-state pipeline with an observation module tracking the observer's viewed area; earlier work categorises rule-based vs learning-based cameras — [GIST PDF](https://scholar.gist.ac.kr/bitstream/local/32302/2/1_s2.0_S2352711025003875_main.pdf), [ESWA 2023](https://cilab.gist.ac.kr/hp/wp-content/uploads/publications/international_journal/2023/ESWA_AO.pdf) (snippet-only)
- PC Gamer reports a spectator revamp with time controls and AI-driven camera (date/status unconfirmed) — [PC Gamer](https://pcgamer.com/league-of-legends-spectator-mode-revamp-adds-time-controls-and-ai-driven-camera)
- **Autohighlight** (Ringer, Nicolaou, Walker 2022, Machine Learning with Applications, DOI 10.1016/j.mlwa.2022.100338): weak supervision from crowd-sourced highlight videos, audio-visual fusion + smoothing — [White Rose](https://eprints.whiterose.ac.uk/186731) (snippet-only)
- Fu et al. 2017 "Video Highlight Prediction Using Audience Chat Reactions" (LoL Twitch data, EMNLP) — [arXiv 1707.08559](https://arxiv.org/abs/1707.08559)
- Valero et al. WDEA 2025 "Real-Time Game Highlight Detection for Data-driven LoL Coaching": visual+audio, optical flow, flags teamfights and objective captures — [CEUR](https://ceur-ws.org/Vol-4055/icaiw_wdea_5.pdf) (snippet-only)
- Murta MSc thesis (IST Lisbon) on event detection in LoL broadcasts (kills, turrets) — [PDF](https://firepuma.isr.tecnico.ulisboa.pt/assets/publications/msc/Thesis_GustavoMurta55175.pdf) (snippet-only)
- Minimap CV: DeepLeague (farzaa; >100k labeled minimap images) [Medium](https://medium.com/@farzatv/deepleague-leveraging-computer-vision-and-deep-learning-on-the-league-of-legends-mini-map-giving-d275fd17c4e0), [V7 dataset](https://www.v7labs.com/open-datasets/deepleague); Roboflow minimap datasets [1](https://universe.roboflow.com/markus-srensen/league-minimap-detection); AAAI 2026 student abstract on synthetic-to-real minimap detection [AAAI](https://ojs.aaai.org/index.php/AAAI/article/view/42235); an open-source optical tracking/analytics platform paper [PDF](https://global-uploads.webflow.com/5f1af76ed86d6771ad48324b/5ff4ac99b18b32db04079ef8_An%20Open-Sourced%20Optical%20Tracking%20and%20Advanced%20eSports%20Analytics%20Platform%20for%20League%20of%20Legends.pdf); overtrack-cv [GitHub](https://github.com/overtrack-gg/overtrack-cv) (all snippet-only)
- No LoL kill-feed OCR repo found; Valorant YOLOv8 kill-feed model is a possible analogue — [Notion write-up](https://languid-sheet-e9c.notion.site/Valorant-Killfeed-Detection-Model-v0-to-killfeed_v5-1d64d388895680778667c65f3e9daa1e)

### Inferences
- A rule-based auto-director driven by Live Client events + Replay API camera control is feasible; the only ML work found targets highlight detection post-hoc or research prototypes, not live production use.

### Gaps
- No open-source "auto observer" for LoL found; GDC/Riot tech blog talks not searched; abstracts' metrics not retrieved.

## 4. Conceptual models for "what to show now"

### Takeaway
Little citable material was found directly on director logic; only the highlight-detection papers above hint at which signals matter (teamfights, objective captures, audio cues).

### Cited Findings
- WDEA 2025 paper treats teamfights and objective captures as key events from visual/audio cues — [CEUR](https://ceur-ws.org/Vol-4055/icaiw_wdea_5.pdf) (snippet-only)
- LeagueBroadcast implements objective timers (baron/elder power play), inhibitor timers and gold graphs as overlay features — [GitHub](https://github.com/floh22/LeagueBroadcast)
- league-studio and Chud Hud track Dragon/Baron/Herald/Grub status and estimated gold — [league-studio](https://raw.githubusercontent.com/jyaniee/league-studio/main/README.md), [Chud Hud](https://raw.githubusercontent.com/McJanrey/Chud-Hud-Manager/main/README.md)

### Inferences
- Event scoring (kills/assists, objective spawn timers, proximity-based fight detection from positions, gold deltas) is the author's synthesis; no source found that publishes a concrete scoring formula. Note that the Live Client Data API's lack of champion positions (per my understanding, UNVERIFIED here) would push fight detection to memory-reading (banned) or CV minimap approaches.

### Gaps
- No primary source on instant-replay automation, proximity fight detection, or event-scoring models for LoL.
