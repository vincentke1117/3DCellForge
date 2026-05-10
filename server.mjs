import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { ProxyAgent } from 'undici'

loadLocalEnv()

const API_PORT = Number(process.env.API_PORT || 8787)
const BODY_LIMIT = 28 * 1024 * 1024
const TRIPO_API_KEY = process.env.TRIPO_API_KEY
const TRIPO_API_BASE = process.env.TRIPO_API_BASE || 'https://api.tripo3d.ai/v2/openapi'
const TRIPO_MODEL_VERSION = process.env.TRIPO_MODEL_VERSION || 'v3.0-20250812'
const HUNYUAN_API_BASE = process.env.HUNYUAN_API_BASE || 'http://127.0.0.1:8081'
const HUNYUAN_CREATE_PATH = process.env.HUNYUAN_CREATE_PATH || '/send'
const HUNYUAN_STATUS_PATH = process.env.HUNYUAN_STATUS_PATH || '/status'
const LOCAL_MODEL_DIR = path.resolve(process.env.LOCAL_MODEL_DIR || '.generated-models')
const OUTBOUND_PROXY_AGENT = createProxyAgent()

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
        providers: {
          tripo: {
            configured: Boolean(TRIPO_API_KEY),
            modelVersion: TRIPO_MODEL_VERSION,
          },
          hunyuan: {
            configured: Boolean(HUNYUAN_API_BASE),
            baseUrl: HUNYUAN_API_BASE,
            createPath: HUNYUAN_CREATE_PATH,
            statusPath: HUNYUAN_STATUS_PATH,
          },
        },
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/3d/generate') {
      const payload = await readJsonBody(request)
      const provider = payload.provider || 'tripo'

      if (provider === 'hunyuan') {
        const task = await createHunyuanTask(payload)
        sendJson(response, 200, task)
        return
      }

      requireTripoKey()
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
      const taskId = decodeURIComponent(url.pathname.replace('/api/3d/status/', ''))
      const provider = url.searchParams.get('provider') || 'tripo'

      if (provider === 'hunyuan') {
        const task = await getHunyuanTask(taskId)
        sendJson(response, 200, task)
        return
      }

      requireTripoKey()
      const task = await getTripoTask(taskId)
      sendJson(response, 200, task)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/3d/model') {
      await proxyModel(url, response)
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/3d/local-model/')) {
      await serveLocalModel(url, response)
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
  console.log(`Hunyuan3D local provider: ${HUNYUAN_API_BASE}`)
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

function createProxyAgent() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  if (!proxy) return null

  return new ProxyAgent(proxy)
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

async function createHunyuanTask(payload) {
  const image = parseDataUrl(payload.imageDataUrl)
  const imageBase64 = image.buffer.toString('base64')
  const requestBody = {
    image: `data:${image.mime};base64,${imageBase64}`,
    image_base64: imageBase64,
    prompt: payload.prompt || '',
    seed: payload.seed ?? 1234,
    remove_background: payload.removeBackground ?? true,
    texture: payload.texture ?? true,
    pbr: payload.pbr ?? true,
    octree_resolution: payload.octreeResolution ?? 256,
    num_inference_steps: payload.numInferenceSteps ?? 50,
    guidance_scale: payload.guidanceScale ?? 5.5,
    face_count: payload.faceCount ?? 60000,
  }

  const raw = await hunyuanRequest(HUNYUAN_CREATE_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  const data = raw.data || raw
  const taskId = findFirstValue(data, ['uid', 'task_id', 'taskId', 'id']) || `hunyuan-${Date.now()}`
  const rawModelUrl = findModelUrl(data)
  const modelBase64 = findFirstValue(data, ['model_base64', 'modelBase64', 'glb_base64', 'glbBase64'])
  let modelUrl = rawModelUrl ? `/api/3d/model?url=${encodeURIComponent(rawModelUrl)}` : ''

  if (modelBase64) {
    await saveLocalModel(taskId, modelBase64)
    modelUrl = `/api/3d/local-model/${encodeURIComponent(taskId)}.glb`
  }

  return {
    provider: 'hunyuan',
    taskId,
    status: modelUrl ? 'success' : 'queued',
    modelUrl,
    raw: sanitizeHunyuanRaw(raw),
  }
}

async function getHunyuanTask(taskId) {
  if (!taskId) {
    throw Object.assign(new Error('taskId is required.'), { status: 400 })
  }

  if (await hasLocalModel(taskId)) {
    return {
      provider: 'hunyuan',
      taskId,
      status: 'success',
      progress: 100,
      modelUrl: `/api/3d/local-model/${encodeURIComponent(taskId)}.glb`,
      rawModelUrl: '',
      error: '',
      raw: {},
    }
  }

  const raw = await hunyuanRequest(`${HUNYUAN_STATUS_PATH}/${encodeURIComponent(taskId)}`, { method: 'GET' })
  const data = raw.data || raw
  const status = normalizeHunyuanStatus(data.status || data.task_status || data.state || data.message || 'running')
  const progress = data.progress ?? data.percent ?? null
  const rawModelUrl = findModelUrl(data)
  const modelBase64 = findFirstValue(data, ['model_base64', 'modelBase64', 'glb_base64', 'glbBase64'])
  let modelUrl = rawModelUrl ? `/api/3d/model?url=${encodeURIComponent(rawModelUrl)}` : ''

  if (modelBase64) {
    await saveLocalModel(taskId, modelBase64)
    modelUrl = `/api/3d/local-model/${encodeURIComponent(taskId)}.glb`
  }

  return {
    provider: 'hunyuan',
    taskId,
    status,
    progress,
    modelUrl,
    rawModelUrl,
    error: data.error || data.message || '',
    raw: sanitizeHunyuanRaw(raw),
  }
}

async function hunyuanRequest(pathname, options = {}) {
  let response
  try {
    response = await fetch(`${HUNYUAN_API_BASE.replace(/\/$/, '')}${pathname.startsWith('/') ? pathname : `/${pathname}`}`, options)
  } catch (error) {
    const wrapped = new Error(`Hunyuan3D local server unavailable at ${HUNYUAN_API_BASE}. Start the local Hunyuan3D API server or switch provider.`)
    wrapped.detail = {
      path: pathname,
      cause: error.cause?.message || error.cause?.code || error.message,
    }
    throw wrapped
  }

  const text = await response.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { message: text || 'Non-JSON response from Hunyuan3D.' }
  }

  if (!response.ok || (typeof data.code === 'number' && data.code !== 0)) {
    const error = new Error(data.message || data.error || `Hunyuan3D request failed with ${response.status}.`)
    error.status = response.status || 502
    error.detail = sanitizeHunyuanRaw(data)
    throw error
  }

  return data
}

function normalizeHunyuanStatus(status) {
  const value = String(status || '').toLowerCase()
  if (['success', 'succeeded', 'completed', 'complete', 'done', 'finish', 'finished'].includes(value)) return 'success'
  if (['failed', 'error', 'cancelled', 'canceled'].includes(value)) return 'failed'
  if (['queued', 'pending', 'waiting'].includes(value)) return 'queued'
  return 'running'
}

function parseModelBase64(modelBase64) {
  const raw = String(modelBase64 || '').replace(/^data:.*?;base64,/, '')
  return Buffer.from(raw, 'base64')
}

async function saveLocalModel(taskId, modelBase64) {
  const buffer = parseModelBase64(modelBase64)
  if (buffer.length < 1024) throw new Error('Hunyuan3D returned an invalid GLB payload.')

  await mkdir(LOCAL_MODEL_DIR, { recursive: true })
  await writeFile(localModelPath(taskId), buffer)
}

async function hasLocalModel(taskId) {
  try {
    await access(localModelPath(taskId))
    return true
  } catch {
    return false
  }
}

function localModelPath(taskId) {
  return path.join(LOCAL_MODEL_DIR, `${sanitizeFileName(taskId)}.glb`)
}

async function serveLocalModel(url, response) {
  const fileName = decodeURIComponent(url.pathname.replace('/api/3d/local-model/', '')).replace(/\.glb$/i, '')
  const buffer = await readFile(localModelPath(fileName))
  response.writeHead(200, {
    'Content-Type': 'model/gltf-binary',
    'Cache-Control': 'private, max-age=3600',
  })
  response.end(buffer)
}

function sanitizeHunyuanRaw(raw) {
  if (!raw || typeof raw !== 'object') return raw
  return JSON.parse(JSON.stringify(raw, (key, value) => {
    if (['model_base64', 'modelBase64', 'glb_base64', 'glbBase64'].includes(key)) return '[base64 omitted]'
    return value
  }))
}

async function proxyModel(url, response) {
  const rawUrl = url.searchParams.get('url')
  if (!rawUrl || !isAllowedProxyModelUrl(rawUrl)) {
    throw Object.assign(new Error('A valid HTTPS or localhost model URL is required.'), { status: 400 })
  }

  const fetchOptions = shouldUseProxy(rawUrl) && OUTBOUND_PROXY_AGENT ? { dispatcher: OUTBOUND_PROXY_AGENT } : {}
  const remote = await fetch(rawUrl, fetchOptions)
  if (!remote.ok || !remote.body) {
    const retry = await fetch(rawUrl, {
      headers: { Authorization: `Bearer ${TRIPO_API_KEY}` },
      ...fetchOptions,
    })
    if (!retry.ok || !retry.body) {
      throw Object.assign(new Error(`Model download failed with ${retry.status || remote.status}.`), { status: 502 })
    }
    streamRemoteModel(retry, response)
    return
  }

  streamRemoteModel(remote, response)
}

function isAllowedProxyModelUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol === 'https:') return true
    if (parsed.protocol !== 'http:') return false
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
  } catch {
    return false
  }
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
      ...(OUTBOUND_PROXY_AGENT ? { dispatcher: OUTBOUND_PROXY_AGENT } : {}),
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

function shouldUseProxy(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    return !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
  } catch {
    return true
  }
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
