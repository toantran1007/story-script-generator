import fs from 'node:fs'
import ts from 'typescript'

function loadApiService() {
  const source = fs.readFileSync('src/renderer/src/services/apiService.ts', 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText
  const module = { exports: {} }
  let requestId = 0
  new Function('module', 'exports', 'require', output)(module, module.exports, (name) => {
    if (name === 'uuid') return { v4: () => `request-${++requestId}` }
    return {}
  })
  return module.exports
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log(`PASS: ${message}`)
}

async function assertRejects(action, message) {
  try {
    await action()
  } catch {
    console.log(`PASS: ${message}`)
    return
  }
  throw new Error(message)
}

const originalSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (callback) => {
  queueMicrotask(callback)
  return 0
}

try {
  let chatCalls = 0
  globalThis.window = {
    api: {
      chat: async () => {
        chatCalls += 1
        if (chatCalls <= 3) throw new TypeError('terminated')
        return 'recovered'
      }
    }
  }

  const api = loadApiService()
  const recovered = await api.chat([], undefined, 'project-1')
  assert(recovered === 'recovered', 'normal chat recovers after three transient failures')
  assert(chatCalls === 4, 'normal chat performs one initial call plus three retries')

  let streamCalls = 0
  let cleanupCalls = 0
  globalThis.window = {
    api: {
      chatStream: async () => {
        streamCalls += 1
        if (streamCalls <= 3) throw new TypeError('terminated')
        return 'stream recovered'
      },
      onStreamChunk: () => () => {
        cleanupCalls += 1
      }
    }
  }

  const streamRecovered = await api.chatStream([], () => {}, undefined, 'project-2')
  assert(streamRecovered === 'stream recovered', 'stream chat recovers after three terminated errors')
  assert(streamCalls === 4, 'stream chat performs one initial call plus three retries')
  assert(cleanupCalls === 4, 'stream listeners are cleaned up after every attempt')

  let exhaustedCalls = 0
  globalThis.window = {
    api: {
      chat: async () => {
        exhaustedCalls += 1
        throw new TypeError('terminated')
      }
    }
  }

  await assertRejects(
    () => api.chat([], undefined, 'project-3'),
    'transient failure is reported after the retry limit is exhausted'
  )
  assert(exhaustedCalls === 4, 'retry limit stops after three retries')

  let authCalls = 0
  globalThis.window = {
    api: {
      chat: async () => {
        authCalls += 1
        throw new Error('API Error 401: Unauthorized')
      }
    }
  }

  await assertRejects(
    () => api.chat([], undefined, 'project-4'),
    'authentication errors are returned without retrying'
  )
  assert(authCalls === 1, 'non-transient errors are not retried')
} finally {
  globalThis.setTimeout = originalSetTimeout
  delete globalThis.window
}
