import { useState, useCallback, useRef } from 'react'

export type Screen =
  | { type: 'list' }
  | { type: 'feature-detail'; featureId: string }
  | { type: 'issue-detail'; issueId: string }
  | { type: 'decisions' }
  | { type: 'settings' }

export type ListPosition = { cursor: number; page: number }
export type ListState = ListPosition & { search: string }

export function useNavigation() {
  const [screen, setScreen] = useState<Screen>({ type: 'list' })
  const listState = useRef<ListState>({ cursor: 0, page: 0, search: '' })

  const openFeature = useCallback((featureId: string, state: ListState) => {
    listState.current = state
    setScreen({ type: 'feature-detail', featureId })
  }, [])

  const openIssue = useCallback((issueId: string, state: ListState) => {
    listState.current = state
    setScreen({ type: 'issue-detail', issueId })
  }, [])

  const openDecisions = useCallback(() => {
    setScreen({ type: 'decisions' })
  }, [])

  const openSettings = useCallback(() => {
    setScreen({ type: 'settings' })
  }, [])

  const goBack = useCallback(() => {
    setScreen({ type: 'list' })
  }, [])

  return { screen, listState: listState.current, openFeature, openIssue, openDecisions, openSettings, goBack }
}
