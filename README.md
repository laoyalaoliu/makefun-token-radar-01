# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/laoyalaoliu/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/laoyalaoliu/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar with a peer-multiple model. It reads the competition's sealed DefiLlama snapshot (758 protocols) and ranks all 198 protocols that record no token yet — every one of the 40 watchlist slugs plus 158 early protocols found below the $50M floor — by implied value: TVL × the median market-cap/TVL multiple of the trading protocols in the same category, adjusted for 7-day momentum, for how long the protocol has run with no token, and for chain reach. Wrapped, staked and bridged products of tokens that already trade (WBTC and its kin) are excluded under the watchlist's own rule. Protocols that already trade are never ranked; they form the peer set and appear in the dashboard's separate reference view at the market's own values. Every board row carries a six-step farm plan with costs and times, generated from the protocol's own category, chains, TVL and age, plus the plan's totals — capital at work, gas over the whole plan, time all-in and the holding window. The dashboard (in `dashboard/`, fed by the generated `data.js`) is sortable (the column heads sort too) and filterable, with a per-protocol detail view that shows the model's arithmetic line by line and a sensitivity check: what the value would be with a neutral week, or priced at the global median multiple instead of its category's. `main.ts` (Node 22, standard library only) writes `board.json`, the dashboard data, and the judge's `dossier.json`.

## Run it

```sh
# Beside the competition kit, whose input/ holds the sealed snapshot:
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
# In the grader's container the snapshot is mounted at /input and the output goes to /output:
node main.ts
# Then open out/dashboard/index.html in a browser — it renders offline from out/data.js.
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=8j9v25ys&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
