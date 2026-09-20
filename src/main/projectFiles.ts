import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, lstatSync, openSync, fsyncSync, closeSync, unlinkSync, rmSync } from 'fs'
import { resolve, join, dirname, relative, isAbsolute } from 'path'
import { randomUUID, createHash } from 'crypto'

export interface StoredProject {
  id: string; name: string; updatedAt?: string; storageEpoch?: number
  generatedStory?: string; hookText?: string
  chapterDocuments?: { chapter: number; text: string; complete: boolean }[]
  chapterMemories?: unknown[]; storyMemory?: unknown; memoryRecords?: unknown[]; memoryHistory?: unknown[]; memoryPackets?: unknown[]; memoryIssues?: unknown[]
}
interface DeletedProject { id: string; name: string; directory: string; epoch: number; deletedAt: string; permanent?: boolean }

export class ProjectFileStore<T extends StoredProject> {
  readonly root: string
  private deleted: Record<string, DeletedProject>

  constructor(root: string) {
    this.root = resolve(root)
    this.checkPath(this.root)
    const marker = join(this.root, 'data-root.json'); this.checkPath(marker)
    if (existsSync(marker) && JSON.parse(readFileSync(marker, 'utf8')).format !== 'kichban-data-v1') throw new Error('Not a Kichban data directory')
    mkdirSync(this.root, { recursive: true })
    for (const folder of ['projects', 'trash', 'migrations']) {
      this.checkPath(join(this.root, folder)); mkdirSync(join(this.root, folder), { recursive: true })
    }
    const probe = join(this.root, `.write-test-${randomUUID()}`)
    writeFileSync(probe, '', { flag: 'wx' }); unlinkSync(probe)
    if (!existsSync(marker)) this.atomic(marker, JSON.stringify({ format: 'kichban-data-v1' }))
    const journal = join(this.root, 'deleted-projects.json')
    this.checkPath(journal)
    this.deleted = existsSync(journal) ? JSON.parse(readFileSync(journal, 'utf8')) : {}
    if (!this.deleted || Array.isArray(this.deleted) || typeof this.deleted !== 'object') throw new Error('Invalid deletion journal; refusing to expose deleted projects')
    for (const [id, entry] of Object.entries(this.deleted)) {
      this.id(id)
      if (!entry || entry.id !== id || !Number.isInteger(entry.epoch) || entry.epoch < 1 || !/^[a-zA-Z0-9_-]+$/.test(entry.directory) || !entry.directory.startsWith(`${id}-`)) throw new Error('Invalid deletion entry')
      const active = this.projectDir(id), trash = this.child('trash', entry.directory)
      if (entry.permanent) {
        this.eraseProjectDirectory(active)
        continue
      }
      // Finish a previously committed delete interrupted before its directory move.
      if (existsSync(active) && !existsSync(trash)) {
        const p = this.readDirectory(active)
        if (p.id !== id) throw new Error('Deletion recovery id mismatch')
        if ((p.storageEpoch || 0) < entry.epoch) renameSync(active, trash)
      }
    }
  }

  private id(id: string): string {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('Invalid project id')
    return id
  }

  private checkPath(path: string): void {
    let cursor = resolve(path)
    while (true) {
      try {
        if (lstatSync(cursor).isSymbolicLink()) throw new Error('Project data paths must not contain symbolic links or junctions')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      const parent = dirname(cursor)
      if (parent === cursor) break
      cursor = parent
    }
  }

  private child(...parts: string[]): string {
    const path = resolve(this.root, ...parts), rel = relative(this.root, path)
    if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) throw new Error('Path escapes project data root')
    this.checkPath(path)
    return path
  }

  private projectDir(id: string): string { return this.child('projects', this.id(id)) }

  private eraseProjectDirectory(directory: string): void {
    this.checkPath(directory)
    const rel = relative(this.child('projects'), directory)
    if (!rel || rel.includes('/') || rel.includes('\\') || rel === '..' || isAbsolute(rel)) throw new Error('Unsafe delete target')
    // Refuse junctions anywhere in the target before recursive removal.
    const checkTree = (path: string): void => {
      this.checkPath(path)
      if (!existsSync(path) || !lstatSync(path).isDirectory()) return
      for (const entry of readdirSync(path)) checkTree(join(path, entry))
    }
    checkTree(directory)
    rmSync(directory, { recursive: true, force: true })
  }

  private projectData(input: T): T {
    const project = JSON.parse(JSON.stringify(input)) as T & Record<string, unknown>
    for (const key of ['apiKey', 'apiProfiles', 'settings', 'authorization']) delete project[key]
    return project
  }

  private atomic(path: string, text: string, backup = false): void {
    this.checkPath(path)
    if (existsSync(path) && readFileSync(path, 'utf8') === text) return
    const temp = `${path}.${randomUUID()}.tmp`
    try {
      const fd = openSync(temp, 'wx')
      try { writeFileSync(fd, text, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
      if (backup && existsSync(path)) this.atomic(`${path}.bak`, readFileSync(path, 'utf8'))
      renameSync(temp, path)
    } finally { if (existsSync(temp)) unlinkSync(temp) }
  }

  private readDirectory(directory: string): T {
    const file = join(directory, 'project.json'); this.checkPath(file)
    const parse = (text: string): T => {
      const value = JSON.parse(text)
      if (value?.schemaVersion !== 1 || !value.project || typeof value.project.name !== 'string') throw new Error('Invalid project snapshot')
      if (value.project.storageEpoch !== undefined && (!Number.isSafeInteger(value.project.storageEpoch) || value.project.storageEpoch < 0)) throw new Error('Invalid storage generation')
      this.id(value.project.id)
      return value.project as T
    }
    try { return parse(readFileSync(file, 'utf8')) }
    catch (original) {
      const backup = `${file}.bak`; this.checkPath(backup)
      if (!existsSync(backup)) throw original
      const text = readFileSync(backup, 'utf8'), project = parse(text)
      if (existsSync(file)) renameSync(file, `${file}.corrupt-${randomUUID()}`)
      this.atomic(file, text)
      return project
    }
  }

  private materialize(directory: string, project: T): void {
    const temp = join(directory, 'temp'); this.checkPath(temp); mkdirSync(temp, { recursive: true })
    const chapters = join(directory, 'chapters'); this.checkPath(chapters); mkdirSync(chapters, { recursive: true })
    this.atomic(join(directory, 'story.txt'), project.generatedStory || '')
    this.atomic(join(directory, 'hook.txt'), project.hookText || '')
    this.atomic(join(directory, 'memory.json'), JSON.stringify({ chapters: project.chapterMemories || [], global: project.storyMemory || null, records: project.memoryRecords || [] }, null, 2))
    this.atomic(join(directory, 'memory-history.json'), JSON.stringify(project.memoryHistory || [], null, 2))
    this.atomic(join(directory, 'memory-packets.json'), JSON.stringify(project.memoryPackets || [], null, 2))
    this.atomic(join(directory, 'memory-issues.json'), JSON.stringify(project.memoryIssues || [], null, 2))
    const documents = project.chapterDocuments || []
    const activeFiles = new Set(documents.map((chapter) => `${chapter.chapter}.txt`))
    for (const file of readdirSync(chapters)) {
      if (/^\d+\.txt$/.test(file) && !activeFiles.has(file)) {
        const target = join(chapters, file); this.checkPath(target); unlinkSync(target)
      }
    }
    for (const chapter of documents) {
      if (!Number.isSafeInteger(chapter.chapter) || chapter.chapter < 1 || typeof chapter.text !== 'string') throw new Error('Invalid chapter document')
      this.atomic(join(chapters, `${chapter.chapter}.txt`), chapter.text)
    }
  }

  list(): T[] {
    const projects: T[] = []
    for (const entry of readdirSync(this.child('projects'), { withFileTypes: true })) {
      if (!entry.isDirectory() || this.deleted[entry.name]) continue
      const directory = this.projectDir(entry.name)
      if (!existsSync(join(directory, 'project.json')) && !existsSync(join(directory, 'project.json.bak'))) continue
      const project = this.readDirectory(directory)
      if (project.id !== entry.name) throw new Error('Project id does not match its directory')
      this.materialize(directory, project)
      projects.push(project)
    }
    return projects
  }

  save(input: T): void {
    const directory = this.projectDir(input.id)
    if (this.deleted[input.id]) throw new Error('Project was deleted; late save rejected')
    const current = existsSync(join(directory, 'project.json')) ? this.readDirectory(directory) : null
    if (current && current.id !== input.id) throw new Error('Project id does not match directory')
    if (current && (current.storageEpoch || 0) !== (input.storageEpoch || 0)) throw new Error('Stale project generation; reload restored project before saving')
    if (current && Date.parse(input.updatedAt || '') < Date.parse(current.updatedAt || '')) return
    const project = this.projectData(input)
    project.storageEpoch = current?.storageEpoch || input.storageEpoch || 0
    mkdirSync(directory, { recursive: true })
    if (current?.generatedStory && !project.generatedStory) {
      const archives = join(directory, 'archives'); this.checkPath(archives); mkdirSync(archives, { recursive: true })
      this.atomic(join(archives, `before-reset-${randomUUID()}.json`), JSON.stringify(current))
    }
    // Derived files may be rebuilt from project.json; commit the canonical snapshot last.
    this.materialize(directory, project)
    this.atomic(join(directory, 'project.json'), JSON.stringify({ schemaVersion: 1, project }), true)
  }

  migrate(legacy: T[]): void {
    if (!legacy.length) return
    const clean = legacy.map((project) => this.projectData(project))
    const contents = JSON.stringify(clean)
    const digest = createHash('sha256').update(contents).digest('hex').slice(0, 16)
    // Backups belong to their project, so deleting the project moves its backups too.
    for (const project of clean) {
      if (this.deleted[this.id(project.id)]) continue
      const directory = this.projectDir(project.id); mkdirSync(directory, { recursive: true })
      const backup = join(directory, `migration-${digest}.json`), snapshot = JSON.stringify(project)
      this.checkPath(backup)
      if (!existsSync(backup)) this.atomic(backup, snapshot)
      if (readFileSync(backup, 'utf8') !== snapshot) throw new Error('Migration backup verification failed')
    }
    this.atomic(this.child('migrations', `import-${digest}.json`), JSON.stringify({ digest, projectIds: clean.map((p) => p.id) }))
    for (const project of clean) {
      if (this.deleted[this.id(project.id)]) continue
      const directory = this.projectDir(project.id)
      if (!existsSync(join(directory, 'project.json'))) this.save(project)
      if (this.readDirectory(directory).id !== project.id) throw new Error('Migration verification failed')
    }
  }

  remove(id: string): void {
    const directory = this.projectDir(id)
    if (this.deleted[id]) {
      if (this.deleted[id].permanent) this.eraseProjectDirectory(directory)
      return
    }
    const project = this.readDirectory(directory)
    if (project.id !== id) throw new Error('Delete target id mismatch')
    const entry: DeletedProject = { id, name: '', directory: `${id}-${randomUUID()}`, epoch: (project.storageEpoch || 0) + 1, deletedAt: new Date().toISOString(), permanent: true }
    const next = { ...this.deleted, [id]: entry }
    this.atomic(this.child('deleted-projects.json'), JSON.stringify(next))
    this.deleted = next
    this.eraseProjectDirectory(directory)
  }

  archive(id: string): void {
    const directory = this.projectDir(id)
    if (this.deleted[id]) return
    const project = this.readDirectory(directory)
    if (project.id !== id) throw new Error('Archive target id mismatch')
    const entry: DeletedProject = { id, name: project.name, directory: `${id}-${randomUUID()}`, epoch: (project.storageEpoch || 0) + 1, deletedAt: new Date().toISOString() }
    const target = this.child('trash', entry.directory)
    this.atomic(this.child('deleted-projects.json'), JSON.stringify({ ...this.deleted, [id]: entry }))
    this.deleted[id] = entry
    renameSync(directory, target)
  }

  saveConverted(input: T): void {
    const directory = this.projectDir(input.id)
    const before = this.readDirectory(directory)
    if (before.generatedStory !== input.generatedStory || JSON.stringify(before.chapterDocuments || []) !== JSON.stringify(input.chapterDocuments || [])) throw new Error('Conversion must preserve existing prose and chapter documents')
    const archives = join(directory, 'archives'); this.checkPath(archives); mkdirSync(archives, { recursive: true })
    const backup = join(archives, `before-long-story-${randomUUID()}.json`)
    const content = JSON.stringify({ schemaVersion: 1, project: before })
    this.atomic(backup, content)
    if (readFileSync(backup, 'utf8') !== content) throw new Error('Conversion backup verification failed')
    this.save(input)
  }

  listDeleted(): DeletedProject[] { return Object.values(this.deleted).filter((entry) => !entry.permanent) }

  restore(id: string): T {
    const directory = this.projectDir(id), entry = this.deleted[id]
    if (!entry) throw new Error('Deleted project not found')
    if (entry.permanent) throw new Error('Dự án đã xoá vĩnh viễn, không thể khôi phục')
    const trash = this.child('trash', entry.directory)
    if (!existsSync(directory)) {
      const project = this.readDirectory(trash)
      if (project.id !== id) throw new Error('Restore source id mismatch')
      project.storageEpoch = entry.epoch
      this.atomic(join(trash, 'project.json'), JSON.stringify({ schemaVersion: 1, project }), true)
      this.atomic(join(trash, 'project.json.bak'), JSON.stringify({ schemaVersion: 1, project }))
      renameSync(trash, directory)
    }
    const project = this.readDirectory(directory)
    if (project.id !== id || project.storageEpoch !== entry.epoch) throw new Error('Restore target is occupied by another project generation')
    this.materialize(directory, project)
    const next = { ...this.deleted }; delete next[id]
    this.atomic(this.child('deleted-projects.json'), JSON.stringify(next))
    this.deleted = next
    return project
  }
}
