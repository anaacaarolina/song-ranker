import { describe, expect, it } from 'vitest'
import type { Track } from '../types'
import {
  createInitialState,
  dedupeById,
  getResult,
  rankReducer,
  worstCaseDuels,
  type RankState,
  type Side,
} from './ranking'

function makeTrack(id: string): Track {
  return {
    id,
    name: `Track ${id}`,
    artists: 'Artist',
    albumName: 'Album',
    albumImageUrl: null,
    previewUrl: null,
    uri: `spotify:track:${id}`,
    externalUrl: '',
  }
}

function makeTracks(n: number): Track[] {
  return Array.from({ length: n }, (_, i) => makeTrack(String(i).padStart(2, '0')))
}

/**
 * Drives the reducer to completion using a comparator, emulating a user that
 * always picks the "smaller" track. Returns the final ranked list.
 */
function autoRank(tracks: Track[], compare: (a: Track, b: Track) => number): Track[] {
  let state = createInitialState(tracks)
  let guard = 0
  while (!state.done) {
    const side: Side = compare(state.left[0], state.right[0]) <= 0 ? 'left' : 'right'
    state = rankReducer(state, { type: 'pick', side })
    if (++guard > 100_000) throw new Error('autoRank did not terminate')
  }
  return getResult(state) ?? []
}

describe('worstCaseDuels', () => {
  it('matches known merge-sort comparison counts', () => {
    expect(worstCaseDuels(0)).toBe(0)
    expect(worstCaseDuels(1)).toBe(0)
    expect(worstCaseDuels(2)).toBe(1)
    expect(worstCaseDuels(3)).toBe(3)
    expect(worstCaseDuels(4)).toBe(5)
    expect(worstCaseDuels(8)).toBe(17)
  })
})

describe('dedupeById', () => {
  it('keeps the first occurrence of each id', () => {
    const tracks = [makeTrack('a'), makeTrack('b'), makeTrack('a'), makeTrack('c')]
    expect(dedupeById(tracks).map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops tracks with empty ids', () => {
    const tracks = [makeTrack('a'), { ...makeTrack('b'), id: '' }, makeTrack('c')]
    expect(dedupeById(tracks).map((t) => t.id)).toEqual(['a', 'c'])
  })
})

describe('createInitialState', () => {
  it('handles zero, one, and two tracks', () => {
    expect(createInitialState([]).done).toBe(true)
    expect(getResult(createInitialState([]))).toEqual([])

    const one = createInitialState(makeTracks(1))
    expect(one.done).toBe(true)
    expect(getResult(one)?.map((t) => t.id)).toEqual(['00'])

    const two = createInitialState(makeTracks(2))
    expect(two.done).toBe(false)
    expect(two.duelCount).toBe(0)
  })
})

describe('rankReducer produces exact rankings', () => {
  const compare = (a: Track, b: Track) => a.id.localeCompare(b.id)

  it('sorts by a comparator for a fixed list', () => {
    const tracks = makeTracks(8)
    const expected = [...tracks].sort(compare).map((t) => t.id)
    const ranked = autoRank(tracks, compare).map((t) => t.id)
    expect(ranked).toEqual(expected)
  })

  it('sorts random lists of many sizes', () => {
    // Deterministic pseudo-shuffle so the test isn't flaky.
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const shuffle = <T,>(arr: T[]) => {
      const a = arr.slice()
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    }

    for (const n of [3, 5, 10, 17, 25, 40, 50]) {
      const tracks = shuffle(makeTracks(n))
      const expected = [...tracks].sort(compare).map((t) => t.id)
      const ranked = autoRank(tracks, compare).map((t) => t.id)
      expect(ranked, `n=${n}`).toEqual(expected)
    }
  })
})

describe('undo', () => {
  it('restores the state from before the last pick', () => {
    const state = createInitialState(makeTracks(4))
    const before = state
    const after = rankReducer(state, { type: 'pick', side: 'left' })
    expect(after.duelCount).toBe(before.duelCount + 1)

    const undone: RankState = rankReducer(after, { type: 'undo' })
    expect(undone.duelCount).toBe(before.duelCount)
    expect(undone.left).toEqual(before.left)
    expect(undone.right).toEqual(before.right)
    expect(undone.history).toEqual(before.history)
  })

  it('is a no-op when there is nothing to undo', () => {
    const state = createInitialState(makeTracks(3))
    expect(rankReducer(state, { type: 'undo' })).toBe(state)
  })

  it('never loses the total track count', () => {
    let state = createInitialState(makeTracks(6))
    const total = state.totalTracks
    state = rankReducer(state, { type: 'pick', side: 'left' })
    state = rankReducer(state, { type: 'undo' })
    expect(state.totalTracks).toBe(total)
  })
})

describe('wins tracking', () => {
  it('increments the chosen track and survives across duels', () => {
    const tracks = makeTracks(4)
    let state = createInitialState(tracks)
    state = rankReducer(state, { type: 'pick', side: 'left' })
    state = rankReducer(state, { type: 'pick', side: 'right' })
    const totalWins = Object.values(state.wins).reduce((a, b) => a + b, 0)
    expect(totalWins).toBe(state.duelCount)
  })
})

describe('battle log', () => {
  it('records every comparison in order with its winner', () => {
    const tracks = makeTracks(4)
    let state = createInitialState(tracks)
    state = rankReducer(state, { type: 'pick', side: 'left' })
    state = rankReducer(state, { type: 'pick', side: 'right' })

    expect(state.battles).toHaveLength(2)
    expect(state.battles[0].winner).toBe('left')
    expect(state.battles[1].winner).toBe('right')

    // A battle always pits two different tracks against each other.
    for (const b of state.battles) {
      expect(b.leftId).not.toBe(b.rightId)
    }
  })

  it('reaches one battle per comparison once ranking completes', () => {
    const tracks = makeTracks(5)
    let state = createInitialState(tracks)
    while (!state.done) {
      state = rankReducer(state, { type: 'pick', side: 'left' })
    }
    // A full merge sort performs exactly duelCount comparisons, each logged.
    expect(state.battles).toHaveLength(state.duelCount)
  })

  it('undo removes the last battle', () => {
    const tracks = makeTracks(4)
    let state = createInitialState(tracks)
    state = rankReducer(state, { type: 'pick', side: 'left' })
    const count = state.battles.length
    state = rankReducer(state, { type: 'undo' })
    expect(state.battles).toHaveLength(count - 1)
  })
})
