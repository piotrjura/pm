import { sweepOutstanding } from '../lib/store.js'

export function cmdSweep() {
  const result = sweepOutstanding()

  const total = result.issuesClosed.length + result.tasksClosed.length +
    result.errorTasksClosed.length + result.featuresFixed.length + result.draftsDeleted.length

  if (total === 0) {
    console.log('All clean — nothing outstanding.')
    return
  }

  console.log('Swept:')

  for (const i of result.issuesClosed) {
    console.log(`  ✓ Issue "${i.issueTitle}" → done`)
  }
  for (const t of result.tasksClosed) {
    console.log(`  ✓ Task "${t.taskTitle}" (${t.featureTitle}) → done`)
  }
  for (const t of result.errorTasksClosed) {
    console.log(`  ✓ Error task "${t.taskTitle}" (${t.featureTitle}) → done`)
  }
  for (const f of result.featuresFixed) {
    console.log(`  ✓ Feature "${f.featureTitle}" → done (all tasks complete)`)
  }
  for (const d of result.draftsDeleted) {
    console.log(`  ✕ Draft "${d.featureTitle}" → deleted (empty)`)
  }
}
