import { useState, useCallback, useEffect } from 'react'
import { watchFile, unwatchFile } from 'node:fs'
import { join } from 'node:path'
import {
  loadStore,
  addFeature,
  deleteFeature,
  addIssue,
  deleteIssue,
  getFeatureProgress,
} from '../lib/store.js'
import type { DataStore, Feature, Issue } from '../lib/types.js'

const DATA_FILE = join(process.cwd(), '.pm', 'data.json')

export function useStore() {
  const [store, setStore] = useState<DataStore>(() => loadStore())

  useEffect(() => {
    watchFile(DATA_FILE, { interval: 300 }, () => {
      setStore(loadStore())
    })
    return () => unwatchFile(DATA_FILE)
  }, [])

  const refresh = useCallback(() => {
    setStore(loadStore())
  }, [])

  const createFeature = useCallback((title: string, type?: Feature['type']) => {
    const feature = addFeature(title, undefined, type)
    setStore(prev => ({ ...prev, features: [...prev.features, feature] }))
    return feature
  }, [])

  const removeFeature = useCallback((id: string) => {
    deleteFeature(id)
    setStore(prev => ({ ...prev, features: prev.features.filter(f => f.id !== id) }))
  }, [])

  const createIssue = useCallback((title: string, priority: Issue['priority'] = 'medium', description?: string) => {
    const issue = addIssue(title, priority, description)
    setStore(prev => ({ ...prev, issues: [...prev.issues, issue] }))
    return issue
  }, [])

  const removeIssue = useCallback((id: string) => {
    deleteIssue(id)
    setStore(prev => ({ ...prev, issues: prev.issues.filter(i => i.id !== id) }))
  }, [])

  const featureProgress = useCallback((feature: Feature) => getFeatureProgress(feature), [])

  return {
    store,
    refresh,
    createFeature,
    removeFeature,
    createIssue,
    removeIssue,
    featureProgress,
  }
}
