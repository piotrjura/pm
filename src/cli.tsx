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
import { cmdDecide } from './commands/decide.js'
import { cmdRecap } from './commands/recap.js'
import { cmdHook } from './commands/hook.js'
import { cmdWhy } from './commands/why.js'
import { cmdCleanup } from './commands/cleanup.js'
import { cmdForget } from './commands/forget.js'
import { cmdSettings } from './commands/settings.js'
import { cmdBridge } from './commands/bridge.js'
// decisions are always enabled — no config toggle needed

const [,, subcommand, ...rest] = process.argv

async function launchTUI() {
  const app = withFullScreen(<App />)
  await app.start()
  await app.waitUntilExit()
}

switch (subcommand) {
  case 'init':
    await cmdInit(rest)
    // After interactive init, launch the TUI if the wizard completed successfully
    if (process.stdin.isTTY && process.exitCode !== 1) {
      await launchTUI()
    }
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
  case 'decide':
    cmdDecide(rest)
    break
  case 'recap':
    cmdRecap(rest)
    break
  case 'hook':
    cmdHook(rest)
    break
  case 'why':
    cmdWhy(rest)
    break
  case 'cleanup':
    cmdCleanup(rest)
    break
  case 'forget':
    cmdForget(rest)
    break
  case 'settings':
    await cmdSettings()
    break
  case 'bridge':
    cmdBridge(rest)
    break
  case 'help':
  case '--help':
  case '-h':
    console.log(`pm — project manager

Commands:
  pm              Open TUI
  pm init         Initialize pm in this directory
  pm next         Show next pending task
  pm start <id>   Mark task as in-progress [--agent <name>] [--model <name>]
  pm done <id>    Mark task as done [--agent <name>] [--model <name>] [--note "..."]
  pm list         List all features and tasks
  pm log [N]      Show last N log entries (default 20)
  pm error <id>          Mark task failed [--note "reason"]
  pm retry <id>          Retry failed task [--note "context"]
  pm review <id>         Approve or reject [--approve | --reject] [--note "..."]

Track work:
  pm add-feature <title> [--description "..."]
  pm add-phase <featureId> <title>
  pm add-task <featureId> <phaseId> <title> [--description "..."] [--files "a,b"] [--priority 1-5]
  pm add-issue <title>   [--type bug|change] [--priority urgent|high|medium|low] [--description "..."] [--model <name>]
  pm decide <id> "decision" [--reasoning "why"] [--action "do this"]
  pm why [search]        List all decisions, or search — find out why something was built a certain way
  pm forget "text"       Remove a decision (exact match or search)
  pm settings            Configure features and agents
  pm init --force        Overwrite hooks and plugins (auto-detects configured agents)
  pm cleanup             Reset stuck tasks [--errors] [--drafts] [--all] [--quiet]
  pm recap               Briefing: active work, recent decisions, next steps
  pm update <id>         Update issue/feature [--priority urgent|high|medium|low] [--title "..."] [--description "..."]
  pm bridge <plan-file>  Import a superpowers plan into pm feature/phase/task structure
  pm show <id>           Feature or issue detail with decisions
`)
    break
  default:
    // No subcommand (or unknown) — open TUI
    await launchTUI()
}
