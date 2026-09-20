import fs from 'node:fs'
import path from 'node:path'
const suites = [
  'live-long-story-acceptance-20260916', 'live-long-story-en-20260916',
  'live-long-story-th-20260916', 'live-long-story-resilience-20260916'
]
const reports = suites.map(folder => ({ folder, report: JSON.parse(fs.readFileSync(path.join(folder, 'report.json'), 'utf8')) }))
const result = {
  generatedAt: new Date().toISOString(), model: reports[0].report.model,
  realRequests: reports.reduce((n, r) => n + r.report.calls.length, 0),
  failedRequests: reports.flatMap(r => r.report.calls.filter(c => c.error).map(c => ({ suite: r.folder, ...c }))),
  storyResults: reports.flatMap(r => r.report.results || []),
  storyProgress: reports.slice(0, 3).map(r => {
    const projectDir = path.join(r.folder, 'data/projects')
    const id = fs.readdirSync(projectDir).find(id => fs.existsSync(path.join(projectDir, id, 'project.json')))
    if (!id) return { suite: r.folder, status: 'no_project' }
    const p = JSON.parse(fs.readFileSync(path.join(projectDir, id, 'project.json'), 'utf8')).project
    return { suite: r.folder, id, status: p.status, completed: p.longStory?.cursor || 0, total: p.longStory?.plan.chapters.length || 0, stage: p.longStory?.stage, checkpointed: true }
  }),
  interruption: reports[3].report.interruptedStream, resume: reports[3].report.resumed,
  contradiction: reports[3].report.contradictionRepaired,
  actualTtsMeasured: false,
  acceptancePassed: reports.slice(0, 3).every(r => r.report.results.some(x => x.passed)) && reports[3].report.interruptedStream && reports[3].report.resumed && reports[3].report.contradictionRepaired
}
fs.mkdirSync('live-long-story-summary', { recursive: true })
fs.writeFileSync('live-long-story-summary/report.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
