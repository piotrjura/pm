// Domain model

export interface Decision {
  /** What was decided */
  decision: string
  /** Why — context, reasoning, alternatives considered */
  reasoning?: string
  /** When */
  at: string
}

export interface Task {
  id: string
  title: string
  description?: string
  files?: string[]
  status: 'pending' | 'in-progress' | 'done' | 'error' | 'review'
  attempt?: number
  maxAttempts?: number
  priority?: number
  requiresReview?: boolean
  /** Implementation note left by the agent when marking done */
  note?: string
  /** Key decisions made during this task */
  decisions?: Decision[]
  doneAt?: string
  startedAt?: string
}

export interface Phase {
  id: string
  title: string
  tasks: Task[]
}

export interface Feature {
  id: string
  /** 'feature' = new capability, 'fix' = bug/regression */
  type: 'feature' | 'fix'
  title: string
  description?: string
  status: 'draft' | 'planned' | 'in-progress' | 'done'
  phases: Phase[]
  /** Feature-level decisions (architecture, approach, scope) */
  decisions?: Decision[]
  createdAt: string
  updatedAt: string
  doneAt?: string
}

export interface Issue {
  id: string
  /** 'bug' = something broken to fix later, 'change' = tiny change already made */
  type: 'bug' | 'change'
  title: string
  description?: string
  status: 'triage' | 'backlog' | 'todo' | 'in-progress' | 'done'
  priority: 'urgent' | 'high' | 'medium' | 'low'
  /** Key decisions made while resolving this issue */
  decisions?: Decision[]
  createdAt: string
}

export interface LogEntry {
  taskId: string
  taskTitle: string
  phaseId: string
  phaseTitle: string
  featureId: string
  featureTitle: string
  action: 'started' | 'completed' | 'error' | 'rejected' | 'reset'
  at: string
  agent?: string
  note?: string
  files?: string[]
}

export interface DataStore {
  pmVersion?: string
  features: Feature[]
  issues: Issue[]
  log: LogEntry[]
}

// The resolved "next task" returned by getNextTask()
export interface NextTask {
  featureId: string
  featureTitle: string
  phaseId: string
  phaseTitle: string
  taskId: string
  taskTitle: string
  description?: string
  files?: string[]
}

