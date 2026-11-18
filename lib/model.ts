// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board ranks pre-token protocols only: a protocol is pre-token when its record carries no token
// (no market cap, no CoinGecko id, no symbol). Wrapped, staked and bridged products of tokens that
// already trade are left off too, under the same exclusions the snapshot's watchlist states (see
// isRankable): their value already trades under another name. Protocols whose token already trades
// are never ranked;
// they are the peer set the model learns from, and the dashboard shows them apart, at the market's own
// values. Every slug on the snapshot's watchlist is on the board (the floor, never a ceiling), and so
// is every other rankable pre-token protocol in the snapshot, however small: the radar exists to find
// the early ones.
//
// Implied value is a peer-multiple claim, built only from the snapshot's own figures:
//
//   peers      = the protocols that record a token, with ratio = mcap_usd / tvl_usd
//   multiple   = the median ratio of the protocol's own category (at least 3 peers), else the median
//                ratio of every peer; clamped to [0.04, 2.50] so one wild category cannot rule a row
//   base       = tvl_usd x multiple
//   momentum   = 1 + 0.30 x clamp(change_7d, -40, 80) / 100     (unreported change counts as 0)
//   maturity   = 0.78 + 0.32 x min(age_days, 1460) / 1460       (age unknown: 0.92)
//   reach      = 1 + 0.02 x min(chains - 1, 5)
//   implied    = max(1, round(base x momentum x maturity x reach))
//
// No protocol name is ever special-cased: the same function scores every row, and each row carries
// its own arithmetic so a reader can check the claim line by line.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard so a reader can re-run the claim by hand. */
export interface ModelConstants {
  multiple_floor: number;
  multiple_cap: number;
  min_category_peers: number;
  momentum_weight: number;
  momentum_floor_pct: number;
  momentum_cap_pct: number;
  maturity_base: number;
  maturity_span: number;
  maturity_days: number;
  unknown_age_maturity: number;
  reach_per_chain: number;
  reach_max_chains: number;
}

export const MODEL: ModelConstants = {
  multiple_floor: 0.04,
  multiple_cap: 2.5,
  min_category_peers: 3,
  momentum_weight: 0.3,
  momentum_floor_pct: -40,
  momentum_cap_pct: 80,
  maturity_base: 0.78,
  maturity_span: 0.32,
  maturity_days: 1460,
  unknown_age_maturity: 0.92,
  reach_per_chain: 0.02,
  reach_max_chains: 5,
};

/** The model's version label: the dashboard names it and the board's rows carry it. */
export const MODEL_VERSION = 'peerx-3';

/** How many already-trading protocols the dashboard's reference view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of board.json: the ranked board's row, with the arithmetic that produced its value. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    multiple_source: string;
    category_peers: number;
    momentum_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
  farm_summary: FarmSummary;
}

/** One farm plan's totals, derived from the same figures its steps state: what the whole plan costs. */
export interface FarmSummary {
  capital_usd: number;
  gas_usd: number;
  weeks: number;
  hold_days: number;
  minutes: number;
}

/** The dashboard's view of one board row: the row itself, farm plan included. */
export interface RadarRow extends BoardRow {}

/** An already-trading protocol: shown at the market's own value, never ranked. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
  mcap_tvl: number | null;
}

/** One category's peer multiple, for the dashboard's methodology panel. */
export interface CategoryMultiple {
  category: string;
  peers: number;
  multiple: number;
}

/** Everything the dashboard renders: the board, the trading reference set, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  peer_count: number;
  global_multiple: number;
  categories: CategoryMultiple[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list, taken on a sorted copy so the caller's order never matters. */
function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * The wrapped-product exclusions, the same ones the snapshot's watchlist rule states: a wrapped,
 * staked or bridged product of a token that already trades is not a launch that has not happened —
 * WBTC is Bitcoin on Ethereum, and ranking it as a future token would be ranking a price that exists.
 * The board applies the rule to every row, not only above the floor: categories Bridge, Canonical
 * Bridge, Liquid Staking, Liquid Restaking, Restaked BTC and CEX, names carrying a whole word
 * wrapped, staked or staking, and names beginning with an exchange's.
 */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol is one the board may rank: pre-token, and not a wrapped product of a trading token. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !(p.category !== null && WRAPPED_CATEGORIES.has(p.category)) &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The peer set's multiples: one clamped median per category, plus the global fallback. */
export function peerMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, { multiple: number; peers: number }>; global: number; peerCount: number } {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    if (p.category !== null) {
      const list = ratiosByCategory.get(p.category) ?? [];
      list.push(ratio);
      ratiosByCategory.set(p.category, list);
    }
  }
  const global = all.length > 0 ? clamp(median(all), model.multiple_floor, model.multiple_cap) : model.multiple_floor;
  const byCategory = new Map<string, { multiple: number; peers: number }>();
  for (const [category, ratios] of ratiosByCategory) {
    if (ratios.length >= model.min_category_peers) {
      byCategory.set(category, { multiple: clamp(median(ratios), model.multiple_floor, model.multiple_cap), peers: ratios.length });
    }
  }
  return { byCategory, global, peerCount: all.length };
}

/** The three adjustments and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { byCategory: Map<string, { multiple: number; peers: number }>; global: number },
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; multipleSource: string; categoryPeers: number; momentumMult: number; maturityMult: number; reachMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const own = protocol.category !== null ? multiples.byCategory.get(protocol.category) : undefined;
  const multiple = own !== undefined ? own.multiple : multiples.global;
  const multipleSource = own !== undefined ? `category median of ${own.peers} trading peers` : 'global median (category has too few trading peers)';
  const growth = clamp(protocol.change_7d ?? 0, model.momentum_floor_pct, model.momentum_cap_pct);
  const momentumMult = 1 + (growth / 100) * model.momentum_weight;
  const maturityMult = age === null ? model.unknown_age_maturity : model.maturity_base + (Math.min(age, model.maturity_days) / model.maturity_days) * model.maturity_span;
  const reachMult = 1 + model.reach_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.reach_max_chains);
  const implied = Math.min(100_000_000_000_000, Math.max(1, Math.round(protocol.tvl_usd * multiple * momentumMult * maturityMult * reachMult)));
  return { implied, multiple, multipleSource, categoryPeers: own?.peers ?? 0, momentumMult, maturityMult, reachMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever the rankable filter says.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The radar proper: every other rankable pre-token protocol in the snapshot, early ones included.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const multiples = peerMultiples(snapshot, model);
  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, multiples, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: watchlist.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      multiple: round4(s.v.multiple),
      multiple_source: s.v.multipleSource,
      category_peers: s.v.categoryPeers,
      momentum_multiplier: round4(s.v.momentumMult),
      maturity_multiplier: round4(s.v.maturityMult),
      reach_multiplier: round4(s.v.reachMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age),
    farm_summary: farmSummary(s.p, s.v.age),
  }));
}

// ---------------------------------------------------------------------------
// Farm plans. Every plan is derived from the protocol's own record: its
// category picks the actions, its first chain picks the gas profile, its TVL
// picks the position size, and its age picks the holding window. Each step
// states what to do, what it costs and how long it takes.
// ---------------------------------------------------------------------------

/** What one transaction roughly costs on the protocol's first chain, in words and in figures. */
function gasProfile(p: SnapshotProtocol): { label: string; oneTx: string; weekly: string; txUsd: number; weeklyUsd: number } {
  const chain = (p.chains[0] ?? '').toLowerCase();
  if (chain === 'ethereum') return { label: 'Ethereum mainnet', oneTx: 'about $18 of ETH in gas', weekly: 'about $12 of ETH a week', txUsd: 18, weeklyUsd: 12 };
  if (chain === 'solana') return { label: 'Solana', oneTx: 'under $1 of SOL in fees', weekly: 'under $1 of SOL a week', txUsd: 0.1, weeklyUsd: 0.1 };
  if (['arbitrum', 'base', 'optimism', 'zksync era', 'scroll', 'linea', 'mantle', 'mode', 'blast', 'taiko'].includes(chain)) {
    return { label: p.chains[0]!, oneTx: 'about $2 of ETH in gas', weekly: 'about $2 of ETH a week', txUsd: 2, weeklyUsd: 2 };
  }
  if (chain === '') return { label: 'its main chain', oneTx: 'about $5 of gas', weekly: 'about $4 of gas a week', txUsd: 5, weeklyUsd: 4 };
  return { label: p.chains[0]!, oneTx: 'about $3 of gas', weekly: 'about $3 of gas a week', txUsd: 3, weeklyUsd: 3 };
}

/** The position size one farm wallet carries, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 500;
  if (p.tvl_usd >= 250_000_000) return 250;
  if (p.tvl_usd >= 50_000_000) return 150;
  if (p.tvl_usd >= 15_000_000) return 100;
  return 50;
}

/** How long a position must be held to count in more than one weekly snapshot, from the protocol's age. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 45;
  if (age < 540) return 30;
  return 21;
}

/** The category's two core actions: opening the position, then deepening it. */
function actionsFor(p: SnapshotProtocol, capital: number, chainLabel: string): { open: string; deepen: string; weekly: string } {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('dex')) {
    return {
      open: `Provide $${capital} of liquidity to ${n}'s largest stable or blue-chip pool on ${chainLabel}, split evenly on both sides`,
      deepen: `Route five swaps of about $${Math.max(10, Math.round(capital / 5))} each through ${n} over the first week, in both directions`,
      weekly: `rebalance the pool position once and add one swap of about $${Math.max(10, Math.round(capital / 10))}`,
    };
  }
  if (c.includes('lend')) {
    return {
      open: `Supply $${capital} of USDC to ${n} on ${chainLabel} and leave the deposit receipt in the same wallet`,
      deepen: `Borrow about $${Math.round(capital * 0.4)} of a second asset against the supply, then supply it back once, keeping the health factor above 1.6`,
      weekly: `repay and redraw a small part of the borrow once, so the account shows borrowing activity as well as supply`,
    };
  }
  if (c.includes('cdp') || c.includes('stable')) {
    return {
      open: `Deposit $${capital} of collateral into ${n} on ${chainLabel} and mint about $${Math.round(capital * 0.5)} of its stable asset`,
      deepen: `Hold the minted stable asset in the wallet, or supply it to ${n}'s own stability pool if it runs one`,
      weekly: `adjust the vault once, adding or repaying a small amount so the collateral ratio stays in the protocol's safe band`,
    };
  }
  if (c.includes('bridge')) {
    const destination = p.chains.find((ch) => ch.toLowerCase() !== 'ethereum') ?? 'the destination chain';
    return {
      open: `Bridge $${capital} of USDC from Ethereum to ${destination} through ${n}, and keep the bridged funds on the far side`,
      deepen: `Use the bridged USDC in one app on the destination chain, then bridge about a quarter of it back through ${n} a week later`,
      weekly: `bridge one small transfer of about $${Math.max(10, Math.round(capital / 10))} in either direction`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      open: `Stake $${capital} of the chain's staking asset through ${n} on ${chainLabel} and keep the liquid receipt token in the wallet`,
      deepen: `Supply the receipt token to one lending or liquidity market that ${n} lists as an integration partner`,
      weekly: `claim and restake the staking rewards once, compounding the position`,
    };
  }
  if (c.includes('derivative') || c.includes('perpetual')) {
    return {
      open: `Deposit $${capital} of USDC as margin on ${n} and open one small delta-neutral hedge, long and short the same size`,
      deepen: `Close and reopen the hedge once at a similar size, so the account records completed trades, not one deposit`,
      weekly: `roll the hedge once and keep total open interest near $${Math.round(capital * 0.5)}`,
    };
  }
  if (c.includes('prediction')) {
    return {
      open: `Fund $${capital} on ${n} and take one position in its most liquid market`,
      deepen: `Take a second position on the other side of a different market, sized near $${Math.round(capital * 0.3)}`,
      weekly: `settle or roll one position and open one new one`,
    };
  }
  if (c.includes('insurance')) {
    return {
      open: `Buy $${capital} of cover from ${n} on ${chainLabel} for the longest term it offers`,
      deepen: `Stake about $${Math.round(capital * 0.5)} into ${n}'s capital pool if it takes outside capital`,
      weekly: `check the cover once and renew it before it lapses`,
    };
  }
  if (c.includes('rwa')) {
    return {
      open: `Mint $${capital} of ${n}'s yield asset on ${chainLabel} after its onboarding check, and hold the asset in the wallet`,
      deepen: `Add about $${Math.round(capital * 0.5)} more to the same asset once the first mint has settled`,
      weekly: `claim the yield once and leave it in the wallet as a balance the protocol can see`,
    };
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return {
      open: `Deposit $${capital} of USDC into ${n}'s largest vault on ${chainLabel} and keep the vault shares in the wallet`,
      deepen: `Read the vault's current allocations and the curator's risk notes, then add about $${Math.round(capital * 0.5)} more only while the vault still holds the assets its page names`,
      weekly: `check the vault's allocation and any curator announcement once, and move to the curator's other vault if its mandate or asset list changes`,
    };
  }
  // Yield, aggregators and every other category share the vault shape.
  return {
    open: `Deposit $${capital} of USDC into ${n}'s main vault or strategy on ${chainLabel} and keep the vault shares in the wallet`,
    deepen: `Move about a third of the position into a second ${n} vault or strategy, so the wallet uses more than one product`,
    weekly: `claim any rewards once and restake or hold them in the same wallet`,
  };
}

/** One step as a single string: the action, then its cost and its time, within the gate's 20..600 characters. */
function step(text: string, cost: string, time: string): string {
  let s = `${text}. Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  return s;
}

/** A protocol's farm plan: six steps, each an action with a cost and a time. */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const gas = gasProfile(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const a = actionsFor(p, capital, gas.label);
  const chainName = p.chains[0] ?? 'its main chain';
  return [
    step(
      `Open a fresh wallet for ${p.name} alone, write its seed phrase on paper, and fund it with the gas asset of ${chainName} plus the $${capital} position`,
      `about $${capital} of capital plus ${gas.oneTx} to fund`,
      '10 minutes',
    ),
    step(a.open, `$${capital} of capital and ${gas.oneTx}`, '15 minutes to set up'),
    step(a.deepen, `${gas.oneTx}, with no new capital beyond the $${capital} already in`, '15 minutes'),
    step(
      `Repeat one qualifying action every week for at least ${Math.ceil(hold / 7)} weeks: ${a.weekly}`,
      gas.weekly,
      '10 minutes a week',
    ),
    step(
      `Hold the position for at least ${hold} days without withdrawing, and check ${p.name}'s own points or rewards page once a week, following only the links the protocol itself publishes`,
      `the $${capital} stays in the position; never pay any fee anyone asks to "release" a reward`,
      `${hold} days of holding, 5 minutes a check`,
    ),
    step(
      `Keep a farm log with the wallet address, every date, amount and transaction hash; if ${p.name} announces a token, claim only from that announcement, and otherwise unwind the position after ${hold} days`,
      'nothing but the log itself',
      '10 minutes to write, 15 minutes to unwind',
    ),
  ];
}

/**
 * A plan's totals, from the same figures its steps state: the capital the position carries, the gas
 * of the four one-off transactions (fund, open, deepen, unwind) plus the weekly actions and checks,
 * and the minutes the steps name, week by week. The dashboard shows them beside the plan so a reader
 * sees the whole cost before the first step.
 */
export function farmSummary(p: SnapshotProtocol, age: number | null): FarmSummary {
  const gas = gasProfile(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const gasUsd = Math.round((gas.txUsd * 4 + gas.weeklyUsd * weeks) * 100) / 100;
  const minutes = 10 + 15 + 15 + weeks * 10 + weeks * 5 + 10 + 15;
  return { capital_usd: capitalFor(p), gas_usd: gasUsd, weeks, hold_days: hold, minutes };
}

/** The already-trading protocols, by market cap, for the dashboard's reference view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const multiples = peerMultiples(snapshot, model);
  const categories: CategoryMultiple[] = [...multiples.byCategory.entries()]
    .map(([category, v]) => ({ category, peers: v.peers, multiple: round4(v.multiple) }))
    .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    peer_count: multiples.peerCount,
    global_multiple: round4(multiples.global),
    categories,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows: the gate wants at least 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
