import { loadStore, getLog, getNextTask, getFeatureProgress } from '../lib/store.js'
import { hasFlag } from '../lib/args.js'
import type { DataStore, Feature, Issue } from '../lib/types.js'
/** Generate a briefing for session onboarding or manual review. */
export function cmdRecap(args: string[] = []) {
  const brief = hasFlag(args, '--brief')
  const store = loadStore()
  const lines: string[] = []

  // In-progress work (highest priority)
  const inProgress = collectInProgress(store.features, store.issues)
  if (inProgress.length > 0) {
    lines.push('## In Progress')
    lines.push('')
    for (const item of inProgress) lines.push(item)
    lines.push('')
  }

  // Next task
  const next = getNextTask()
  if (next) {
    lines.push('## Next Up')
    lines.push(`  "${next.taskTitle}" (${next.featureTitle} > ${next.phaseTitle})`)
    if (next.description) lines.push(`  ${next.description}`)
    if (next.files?.length) lines.push(`  Files: ${next.files.join(', ')}`)
    lines.push(`  → pm start ${next.taskId}`)
    lines.push('')
  }

  // Recent features (active or completed in last 7 days)
  const recentFeatures = store.features.filter(f => {
    if (f.status !== 'done') return true
    if (!f.doneAt) return false
    return isWithinDays(f.doneAt, 7)
  })
  if (recentFeatures.length > 0) {
    // Brief: only show non-done features with decisions
    const toShow = brief ? recentFeatures.filter(f => f.status !== 'done') : recentFeatures
    if (toShow.length > 0) {
      lines.push('## Features')
      for (const f of toShow) {
        const { done, total } = getFeatureProgress(f)
        const status = f.status === 'done' ? 'DONE' : `${done}/${total}`
        lines.push(`  [${status}] ${f.title}`)
        if (!brief && f.description) lines.push(`    ${f.description}`)
        if (f.decisions?.length) {
          for (const d of f.decisions) {
            lines.push(`    Decision: ${d.decision}`)
            if (!brief && d.reasoning) lines.push(`      Why: ${d.reasoning}`)
          }
        }
      }
      lines.push('')
    }
  }

  // Active issues
  const activeIssues = store.issues.filter(i => i.status !== 'done')
  if (activeIssues.length > 0) {
    lines.push('## Open Issues')
    for (const i of activeIssues) {
      lines.push(`  [${i.priority}] ${i.title}`)
      if (i.decisions?.length) {
        for (const d of i.decisions) lines.push(`    Decision: ${d.decision}`)
      }
    }
    lines.push('')
  }

  // Recent log — brief gets 5, full gets 10
  const logCount = brief ? 5 : 10
  const log = getLog(logCount)
  if (log.length > 0) {
    lines.push('## Recent Activity')
    for (const entry of log) {
      const action = entry.action === 'started' ? '▶' : entry.action === 'completed' ? '✓' : entry.action === 'error' ? '✗' : entry.action === 'reset' ? '↺' : '←'
      const date = new Date(entry.at).toLocaleDateString()
      const meta = [entry.agent, entry.model].filter(Boolean).join('/')
      const metaLabel = meta ? ` [${meta}]` : ''
      const label = entry.issueTitle
        ? entry.issueTitle
        : `${entry.featureTitle} > ${entry.taskTitle}`
      lines.push(`  ${action} ${date} ${label}${metaLabel}`)
      if (!brief && entry.note) lines.push(`    ${entry.note}`)
    }
    lines.push('')
  }

  // Decision count hint — remind Claude that pm why exists
  const decisionCount = countDecisions(store)
  if (decisionCount > 0) {
    lines.push(`## Decisions`)
    lines.push(`  ${decisionCount} recorded decision${decisionCount === 1 ? '' : 's'} — search with: pm why "keyword"`)
    lines.push('')
  }

  if (lines.length === 0) {
    lines.push('No tracked work yet. Start with:')
    lines.push('  pm add-feature "title" --description "..."')
    lines.push('  pm add-issue "quick fix description"')
  }

  console.log(lines.join('\n'))
}

function collectInProgress(features: Feature[], issues: Issue[]): string[] {
  const lines: string[] = []

  for (const feature of features) {
    if (feature.status !== 'in-progress') continue
    const { done, total } = getFeatureProgress(feature)
    lines.push(`  Feature: "${feature.title}" (${done}/${total} tasks)`)

    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.status === 'in-progress') {
          const meta = [task.agent, task.model].filter(Boolean).join('/')
          const metaLabel = meta ? ` [${meta}]` : ''
          lines.push(`    → Task: "${task.title}" (${phase.title})${metaLabel}`)
          if (task.description) lines.push(`      ${task.description}`)
          if (task.decisions?.length) {
            for (const d of task.decisions) {
              lines.push(`      Decision: ${d.decision}`)
            }
          }
        }
      }
    }
  }

  for (const issue of issues) {
    if (issue.status === 'in-progress') {
      const meta = [issue.agent, issue.model].filter(Boolean).join('/')
      const metaLabel = meta ? ` [${meta}]` : ''
      lines.push(`  Issue: "${issue.title}" [${issue.priority}]${metaLabel}`)
      if (issue.decisions?.length) {
        for (const d of issue.decisions) lines.push(`    Decision: ${d.decision}`)
      }
    }
  }

  return lines
}

function countDecisions(store: DataStore): number {
  let count = 0
  for (const f of store.features) {
    count += f.decisions?.length ?? 0
    for (const p of f.phases) {
      for (const t of p.tasks) {
        count += t.decisions?.length ?? 0
      }
    }
  }
  for (const i of store.issues) {
    count += i.decisions?.length ?? 0
  }
  return count
}

function isWithinDays(isoDate: string, days: number): boolean {
  const date = new Date(isoDate)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return date >= cutoff
}
