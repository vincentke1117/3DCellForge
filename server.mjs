import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { ProxyAgent, setGlobalDispatcher } from 'undici'

loadLocalEnv()
configureProxy()

const API_PORT = Number(process.env.API_PORT || 8787)
const BODY_LIMIT = 28 * 1024 * 1024
const TRIPO_API_KEY = process.env.TRIPO_API_KEY
const TRIPO_API_BASE = process.env.TRIPO_API_BASE || 'https://api.tripo3d.ai/v2/openapi'
const TRIPO_MODEL_VERSION = process.env.TRIPO_MODEL_VERSION || 'v3.0-20250812'

const server = http.createServer(async (request, response) => {
  try {
    setCorsHeaders(response)

    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    const url = new URL(request.url, `http://${request.headers.host}`)

    if (request.method === 'GET' && url.pathname === '/api/3d/health') {
      sendJson(response, 200, {
        ok: true,
        provider: 'tripo',
        configured: Boolean(TRIPO_API_KEY),
        modelVersion: TRIPO_MODEL_VERSION,
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/3d/generate') {
      requireTripoKey()
      const payload = await readJsonBody(request)
      const image = parseDataUrl(payload.imageDataUrl)
      const fileName = sanitizeFileName(payload.fileName || `cell-reference.${image.ext}`)
      const fileToken = await uploadImageToTripo({ ...image, fileName })
      const task = await createTripoImageTask({
        fileToken,
        fileType: image.ext,
        prompt: payload.prompt,
      })

      sendJson(response, 200, {
        provider: 'tripo',
        taskId: task.taskId,
        raw: task.raw,
      })
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/3d/status/')) {
      requireTripoKey()
      const taskId = decodeURIComponent(url.pathname.replace('/api/3d/status/', ''))
      const task = await getTripoTask(taskId)
      sendJson(response, 200, task)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/3d/model') {
      requireTripoKey()
      await proxyModel(url, response)
      return
    }

    sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    const status = error.status || 500
    sendJson(response, status, {
      error: error.message || 'Server error',
      detail: error.detail,
    })
  }
})

server.listen(API_PORT, () => {
  console.log(`Bio demo API running at http://127.0.0.1:${API_PORT}`)
  console.log(TRIPO_API_KEY ? 'Tripo API key loaded from environment.' : 'TRIPO_API_KEY is missing. Add it to .env.local.')
})

function loadLocalEnv() {
  if (!existsSync('.env.local')) return

  const env = readFileSync('.env.local', 'utf8')
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const index = trimmed.indexOf('=')
    if (index === -1) continue

    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    value = value.replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

function configureProxy() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  if (!proxy) return

  setGlobalDispatcher(new ProxyAgent(proxy))
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function requireTripoKey() {
  if (!TRIPO_API_KEY) {
    const error = new Error('TRIPO_API_KEY is not configured on the backend.')
    error.status = 500
    throw error
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0

    request.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error('Image payload is too large.'), { status: 413 }))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })

    request.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(Object.assign(new Error('Invalid JSON payload.'), { status: 400 }))
      }
    })

    request.on('error', reject)
  })
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    throw Object.assign(new Error('imageDataUrl is required.'), { status: 400 })
  }

  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/)
  if (!match) {
    throw Object.assign(new Error('Only PNG, JPEG, or WebP image data URLs are supported.'), { status: 400 })
  }

  const mime = match[1]
  const buffer = Buffer.from(match[2], 'base64')
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'

  if (buffer.length < 1024) {
    throw Object.assign(new Error('Image is too small for 3D generation.'), { status: 400 })
  }

  return { mime, buffer, ext }
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^\w.\- ]+/g, '').trim() || 'cell-reference.png'
}

async function uploadImageToTripo({ buffer, mime, fileName }) {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mime }), fileName)

  const result = await tripoRequest('/upload', {
    method: 'POST',
    body: form,
  })
  const fileToken = findFirstValue(result, ['file_token', 'fileToken', 'image_token', 'imageToken', 'token'])

  if (!fileToken) {
    const error = new Error('Tripo upload did not return a file token.')
    error.detail = result
    throw error
  }

  return fileToken
}

async function createTripoImageTask({ fileToken, fileType, prompt }) {
  const richPayload = {
    type: 'image_to_model',
    model_version: TRIPO_MODEL_VERSION,
    file: {
      type: fileType,
      file_token: fileToken,
    },
    prompt: prompt || '',
    texture: true,
    pbr: true,
    texture_quality: 'detailed',
    geometry_quality: 'detailed',
    enable_image_autofix: true,
  }

  try {
    return normalizeTaskCreateResponse(await tripoRequest('/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(richPayload),
    }))
  } catch (error) {
    const minimalPayload = {
      type: 'image_to_model',
      file: {
        type: fileType,
        file_token: fileToken,
      },
    }

    return normalizeTaskCreateResponse(await tripoRequest('/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minimalPayload),
    }))
  }
}

function normalizeTaskCreateResponse(raw) {
  const taskId = findFirstValue(raw, ['task_id', 'taskId', 'id'])
  if (!taskId) {
    const error = new Error('Tripo task response did not include a task id.')
    error.detail = raw
    throw error
  }

  return { taskId, raw }
}

async function getTripoTask(taskId) {
  if (!taskId) {
    throw Object.assign(new Error('taskId is required.'), { status: 400 })
  }

  const raw = await tripoRequest(`/task/${encodeURIComponent(taskId)}`, { method: 'GET' })
  const data = raw.data || raw
  const status = data.status || data.task_status || data.state || 'unknown'
  const rawModelUrl = findModelUrl(data)

  return {
    provider: 'tripo',
    taskId,
    status,
    progress: data.progress ?? data.percent ?? null,
    modelUrl: rawModelUrl ? `/api/3d/model?url=${encodeURIComponent(rawModelUrl)}` : '',
    rawModelUrl,
    error: data.error || data.message || '',
    raw,
  }
}

async function proxyModel(url, response) {
  const rawUrl = url.searchParams.get('url')
  if (!rawUrl || !/^https:\/\//.test(rawUrl)) {
    throw Object.assign(new Error('A valid HTTPS model URL is required.'), { status: 400 })
  }

  const remote = await fetch(rawUrl)
  if (!remote.ok || !remote.body) {
    const retry = await fetch(rawUrl, {
      headers: { Authorization: `Bearer ${TRIPO_API_KEY}` },
    })
    if (!retry.ok || !retry.body) {
      throw Object.assign(new Error(`Model download failed with ${retry.status || remote.status}.`), { status: 502 })
    }
    streamRemoteModel(retry, response)
    return
  }

  streamRemoteModel(remote, response)
}

function streamRemoteModel(remote, response) {
  response.writeHead(200, {
    'Content-Type': remote.headers.get('content-type') || 'model/gltf-binary',
    'Cache-Control': 'private, max-age=3600',
  })
  Readable.fromWeb(remote.body).pipe(response)
}

async function tripoRequest(path, options = {}) {
  let response
  try {
    response = await fetch(`${TRIPO_API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${TRIPO_API_KEY}`,
        ...(options.headers || {}),
      },
    })
  } catch (error) {
    const wrapped = new Error(`Tripo network request failed: ${error.message}`)
    wrapped.detail = {
      path,
      cause: error.cause?.message || error.cause?.code || '',
      proxy: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy),
    }
    throw wrapped
  }
  const text = await response.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { message: text || 'Non-JSON response from Tripo.' }
  }

  if (!response.ok || (typeof data.code === 'number' && data.code !== 0)) {
    const error = new Error(data.message || data.error || `Tripo request failed with ${response.status}.`)
    error.status = response.status || 502
    error.detail = data
    throw error
  }

  return data
}

function findFirstValue(value, keys) {
  if (!value || typeof value !== 'object') return ''

  for (const key of keys) {
    if (typeof value[key] === 'string' && value[key]) return value[key]
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findFirstValue(item, keys)
        if (found) return found
      }
    } else if (child && typeof child === 'object') {
      const found = findFirstValue(child, keys)
      if (found) return found
    }
  }

  return ''
}

function findModelUrl(value) {
  const urls = []
  collectUrls(value, urls)

  const glb = urls.find((url) => /\.glb(?:[?#]|$)/i.test(url))
  if (glb) return glb

  return urls.find((url) => /\.(?:gltf|fbx|obj)(?:[?#]|$)/i.test(url)) || ''
}

function collectUrls(value, urls) {
  if (!value) return

  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) urls.push(value)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls))
    return
  }

  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectUrls(item, urls))
  }
}
