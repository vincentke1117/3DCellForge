import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseDataUrl, sanitizeFileName } from '../server/http-utils.mjs'
import { getModelExtension, shouldAttachTripoAuth, validateModelBuffer } from '../server/model-store.mjs'
import { findFirstValue, findModelUrl, isSuccessStatus } from '../server/object-utils.mjs'
import { decodeRodinTaskId, encodeRodinTaskId, findRodinDownloadItem, normalizeRodinStatus } from '../server/providers/rodin.mjs'

describe('server utility functions', () => {
  it('sanitizes uploaded filenames without losing readable words', () => {
    assert.equal(sanitizeFileName('../plant cell ✨.png'), 'plant cell .png')
    assert.equal(sanitizeFileName(''), 'cell-reference.png')
  })

  it('parses supported image data URLs and rejects tiny payloads', () => {
    const dataUrl = `data:image/png;base64,${Buffer.alloc(1024).toString('base64')}`
    const image = parseDataUrl(dataUrl)

    assert.equal(image.mime, 'image/png')
    assert.equal(image.ext, 'png')
    assert.equal(image.buffer.length, 1024)
    assert.throws(() => parseDataUrl('data:text/plain;base64,abc'), /Only PNG, JPEG, or WebP/)
    assert.throws(() => parseDataUrl(`data:image/png;base64,${Buffer.alloc(8).toString('base64')}`), /too small/)
  })

  it('detects model extensions and validates GLB headers', () => {
    assert.equal(getModelExtension('https://example.com/model.glb?download=1'), 'glb')
    assert.equal(getModelExtension('scene.gltf'), 'gltf')
    assert.throws(() => getModelExtension('model.obj'), /Only GLB/)

    assert.doesNotThrow(() => validateModelBuffer(Buffer.concat([Buffer.from('glTF'), Buffer.alloc(28)]), 'glb'))
    assert.throws(() => validateModelBuffer(Buffer.concat([Buffer.from('nope'), Buffer.alloc(28)]), 'glb'), /GLB files/)
  })

  it('does not attach Tripo auth to arbitrary model URLs', () => {
    assert.equal(shouldAttachTripoAuth('https://example.com/model.glb'), false)
    assert.equal(shouldAttachTripoAuth('http://127.0.0.1:8787/model.glb'), false)
  })

  it('finds nested task ids and preferred model URLs', () => {
    const payload = {
      data: {
        task: { task_id: 'task-123' },
        assets: [
          { url: 'https://example.com/preview.png' },
          { result: 'https://example.com/model.obj' },
          { result: 'https://example.com/model.glb?x=1' },
        ],
      },
    }

    assert.equal(findFirstValue(payload, ['task_id']), 'task-123')
    assert.equal(findModelUrl(payload), 'https://example.com/model.glb?x=1')
    assert.equal(findModelUrl({ result: 'https://example.com/model.obj' }), '')
    assert.equal(isSuccessStatus('finished'), true)
    assert.equal(isSuccessStatus('running'), false)
  })

  it('normalizes Rodin task ids, statuses, and downloads', () => {
    const task = { taskUuid: 'task-uuid-1', subscriptionKey: 'subscription-key-1' }
    const encoded = encodeRodinTaskId(task)

    assert.deepEqual(decodeRodinTaskId(encoded), task)
    assert.deepEqual(decodeRodinTaskId('legacy-task-id'), { taskUuid: 'legacy-task-id', subscriptionKey: 'legacy-task-id' })
    assert.equal(normalizeRodinStatus(['Done', 'Done']), 'success')
    assert.equal(normalizeRodinStatus(['Waiting']), 'queued')
    assert.equal(normalizeRodinStatus(['Generating']), 'running')
    assert.equal(normalizeRodinStatus(['Done', 'Failed']), 'failed')
    assert.deepEqual(
      findRodinDownloadItem({
        list: [
          { name: 'preview.webp', url: 'https://example.com/preview.webp' },
          { name: 'model.glb', url: 'https://cdn.example.com/signed-download' },
        ],
      }),
      { name: 'model.glb', url: 'https://cdn.example.com/signed-download' },
    )
  })
})
