import type { Track } from '../types'

/**
 * Exact ranking via a queue-based, interactive merge sort.
 *
 * The queue holds sorted "runs" (each starts as a single track). Two runs are
 * shifted off the front and merged one comparison at a time — each `pick` moves
 * the chosen head into `merged`. When one run empties, the other drains in and
 * the completed run goes to the back of the queue. When only one run remains,
 * it is the fully sorted ranking.
 *
 * This is a pure reducer so it's trivial to test and to persist/resume.
 */

export type Side = 'left' | 'right'

/** A single comparison: two tracks face off and one wins. */
export interface Battle {
  leftId: string
  rightId: string
  winner: Side
}

export interface HistoryEntry {
  queue: Track[][]
  left: Track[]
  right: Track[]
  merged: Track[]
  duelCount: number
  done: boolean
  wins: Record<string, number>
  battles: Battle[]
}

export interface RankState {
  queue: Track[][]
  left: Track[]
  right: Track[]
  merged: Track[]
  /** Comparisons made so far. */
  duelCount: number
  /** Total tracks being ranked (after dedupe). */
  totalTracks: number
  /** Number of duels each track id has won. */
  wins: Record<string, number>
  /** Every comparison made, in order, with its winner. */
  battles: Battle[]
  done: boolean
  history: HistoryEntry[]
}

export type RankAction =
  | { type: 'pick'; side: Side }
  | { type: 'undo' }
  | { type: 'reset'; tracks: Track[]; restored?: RankState }

export function dedupeById(tracks: Track[]): Track[] {
  const seen = new Set<string>()
  const out: Track[] = []
  for (const t of tracks) {
    if (t.id && !seen.has(t.id)) {
      seen.add(t.id)
      out.push(t)
    }
  }
  return out
}

/** Fisher–Yates shuffle (in-place on a copy) to remove playlist-order bias. */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Worst-case number of duels for a merge sort on n items:
 *   n·⌈log₂ n⌉ − 2^⌈log₂ n⌉ + 1
 * Used only for the progress bar.
 */
export function worstCaseDuels(n: number): number {
  if (n <= 1) return 0
  const k = Math.ceil(Math.log2(n))
  return n * k - 2 ** k + 1
}

function beginDuel(queue: Track[][], duelCount: number, totalTracks: number): RankState {
  if (queue.length === 0) {
    return { queue: [], left: [], right: [], merged: [], duelCount, totalTracks, wins: {}, battles: [], done: true, history: [] }
  }
  if (queue.length === 1) {
    return { queue: [], left: queue[0], right: [], merged: [], duelCount, totalTracks, wins: {}, battles: [], done: true, history: [] }
  }
  return {
    queue: queue.slice(2),
    left: queue[0],
    right: queue[1],
    merged: [],
    duelCount,
    totalTracks,
    wins: {},
    battles: [],
    done: false,
    history: [],
  }
}

export function createInitialState(tracks: Track[]): RankState {
  const deduped = dedupeById(tracks)
  const queue = shuffle(deduped).map((t) => [t])
  return beginDuel(queue, 0, deduped.length)
}

export function rankReducer(state: RankState, action: RankAction): RankState {
  switch (action.type) {
    case 'pick':
      return pick(state, action.side)
    case 'undo': {
      const last = state.history[state.history.length - 1]
      if (!last) return state
      return {
        queue: last.queue,
        left: last.left,
        right: last.right,
        merged: last.merged,
        duelCount: last.duelCount,
        totalTracks: state.totalTracks,
        wins: last.wins,
        battles: last.battles,
        done: last.done,
        history: state.history.slice(0, -1),
      }
    }
    case 'reset':
      return action.restored ?? createInitialState(action.tracks)
  }
}

function pick(state: RankState, side: Side): RankState {
  if (state.done) return state

  const source = side === 'left' ? state.left : state.right
  const head = source[0]

  const merged = [...state.merged, head]
  const left = side === 'left' ? state.left.slice(1) : state.left
  const right = side === 'right' ? state.right.slice(1) : state.right
  const duelCount = state.duelCount + 1
  const wins = { ...state.wins, [head.id]: (state.wins[head.id] ?? 0) + 1 }

  const battle: Battle = {
    leftId: state.left[0].id,
    rightId: state.right[0].id,
    winner: side,
  }
  const battles = [...(state.battles ?? []), battle]

  const historyEntry: HistoryEntry = {
    queue: state.queue,
    left: state.left,
    right: state.right,
    merged: state.merged,
    duelCount: state.duelCount,
    done: state.done,
    wins: state.wins,
    battles: state.battles ?? [],
  }

  // Both runs still have items → stay in this duel.
  if (left.length > 0 && right.length > 0) {
    return { ...state, left, right, merged, duelCount, wins, battles, history: [...state.history, historyEntry] }
  }

  // A run is exhausted → finish the merge, queue the result, start the next duel.
  const remaining = left.length > 0 ? left : right
  const completed = [...merged, ...remaining]
  const next = beginDuel([...state.queue, completed], duelCount, state.totalTracks)
  return { ...next, wins, battles, history: [...state.history, historyEntry] }
}

/** The final ranked list, or null if ranking isn't finished yet. */
export function getResult(state: RankState): Track[] | null {
  return state.done ? state.left : null
}
