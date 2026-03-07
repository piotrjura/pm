// Domain model

export interface Task {
  id: string
  title: string
  description?: string
  files?: string[]
  status: 'pending' | 'in-progress' | 'done' | 'error' | 'review'
  attempt?: number
  maxAttempts?: number
  priority?: number
  dependsOn?: string[]
  requiresReview?: boolean
  /** Implementation note left by the agent when marking done */
  note?: string
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
  featureId?: string
  createdAt: string
}

export interface LogEntry {
  taskId: string
  taskTitle: string
  phaseId: string
  phaseTitle: string
  featureId: string
  featureTitle: string
  action: 'started' | 'completed' | 'error' | 'rejected'
  at: string
  agent?: string
  note?: string
  files?: string[]
}

export interface DataStore {
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

