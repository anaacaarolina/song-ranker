import { useCallback, useState } from 'react'
import type { Track } from '../types'
import type { RankAction, RankState, Side } from '../lib/ranking'
import { createInitialState, rankReducer, worstCaseDuels } from '../lib/ranking'

export interface RankingSession {
  state: RankState
  left: Track | null
  right: Track | null
  result: Track[] | null
  totalDuels: number
  progress: number
  canUndo: boolean
  start: (tracks: Track[], restored?: RankState) => void
  pick: (side: Side) => void
  undo: () => void
}

/**
 * Bridges the pure ranking reducer to React, exposing the current duel
 * (left vs right), a progress value, and the stable action callbacks.
 */
export function useRankingSession(): RankingSession {
  const [state, setState] = useState<RankState>(() => createInitialState([]))

  const dispatch = useCallback((action: RankAction) => {
    setState((prev) => rankReducer(prev, action))
  }, [])

  const start = useCallback((tracks: Track[], restored?: RankState) => {
    setState(restored ?? createInitialState(tracks))
  }, [])

  const pick = useCallback((side: Side) => dispatch({ type: 'pick', side }), [dispatch])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [dispatch])

  const left = !state.done && state.left.length > 0 ? state.left[0] : null
  const right = !state.done && state.right.length > 0 ? state.right[0] : null
  const result = state.done ? state.left : null

  const totalDuels = worstCaseDuels(state.totalTracks)
  const progress = totalDuels <= 0 ? 1 : Math.min(1, state.duelCount / totalDuels)

  return {
    state,
    left,
    right,
    result,
    totalDuels,
    progress,
    canUndo: state.history.length > 0,
    start,
    pick,
    undo,
  }
}
