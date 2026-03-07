import React from 'react'
import { withFullScreen } from 'fullscreen-ink'
import { App } from './app.js'
import { cmdNext } from './commands/next.js'
import { cmdInit } from './commands/init.js'
import { cmdDone } from './commands/done.js'
import { cmdStart } from './commands/start.js'
import { cmdList } from './commands/list.js'
import { cmdLog } from './commands/log.js'
import { cmdError } from './commands/error.js'
import { cmdRetry } from './commands/retry.js'
import { cmdReview } from './commands/review.js'
import { cmdAddFeature } from './commands/add-feature.js'
import { cmdAddPhase } from './commands/add-phase.js'
import { cmdAddTask } from './commands/add-task.js'
import { cmdAddIssue } from './commands/add-issue.js'
import { cmdShow } from './commands/show.js'
import { cmdUpdate } from './commands/update.js'
import { ensureInstructionsUpToDate } from './lib/claude-md.js'

const [,, subcommand, ...rest] = process.argv

// Auto-update CLAUDE.md instructions if pm version changed
if (subcommand !== 'init' && subcommand !== 'help' && subcommand !== '--help' && subcommand !== '-h') {
  ensureInstructionsUpToDate()
}

switch (subcommand) {
  case 'init':
    await cmdInit()
    break
  case 'next':
    cmdNext()
    break
  case 'done':
    cmdDone(rest)
    break
  case 'start':
    cmdStart(rest)
    break
  case 'list':
  case 'ls':
    cmdList()
    break
  case 'log':
    cmdLog(rest)
    break
  case 'error':
    cmdError(rest)
    break
  case 'retry':
    cmdRetry(rest)
    break
  case 'review':
    cmdReview(rest)
    break
  case 'add-feature':
    cmdAddFeature(rest)
    break
  case 'add-phase':
    cmdAddPhase(rest)
    break
  case 'add-task':
    cmdAddTask(rest)
    break
  case 'add-issue':
    cmdAddIssue(rest)
    break
  case 'show':
    cmdShow(rest)
    break
  case 'update':
    cmdUpdate(rest)
    break
  case 'help':
  case '--help':
  case '-h':
    console.log(`pm — project manager

Commands:
  pm              Open TUI
  pm init         Initialize pm in this directory (writes instructions to CLAUDE.md)
  pm next         Show next pending task (updates CLAUDE.md)
  pm start <id>   Mark task as in-progress [--agent <name>]
  pm done <id>    Mark task as done [--agent <name>] [--note "..."]
  pm list         List all features and tasks
  pm log [N]      Show last N log entries (default 20)
  pm error <id>          Mark task failed [--note "reason"]
  pm retry <id>          Retry failed task [--note "context"]
  pm review <id>         Approve or reject [--approve | --reject] [--note "..."]

Track work:
  pm add-feature <title> [--description "..."]
  pm add-phase <featureId> <title>
  pm add-task <featureId> <phaseId> <title> [--description "..."] [--files "a,b"] [--priority 1-5] [--depends-on "id1,id2"]
  pm add-issue <title>   [--type bug|change] [--priority urgent|high|medium|low] [--description "..."]
  pm update <id>         Update issue/feature [--priority urgent|high|medium|low] [--title "..."] [--description "..."]
  pm show <featureId>    Feature detail with all IDs
`)
    break
  default:
    // No subcommand (or unknown) — open TUI
    const app = withFullScreen(<App />)
    await app.start()
    await app.waitUntilExit()
}
