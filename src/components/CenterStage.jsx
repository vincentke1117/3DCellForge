import { useEffect, useState } from 'react'
import { Box, Camera, CircleDot, Eye, Layers3, Move3D, RotateCcw, Upload } from 'lucide-react'
import { getCell, getGeneratedModelUrl, getOrganelleDetail } from '../domain/cellCatalog.js'
import { downloadCanvasImage } from '../lib/downloads.js'
import { downloadLayeredPngSnapshot } from '../lib/imagePipeline.js'
import { canUseWebGL } from '../lib/webgl.js'
import { getProviderLabel } from '../services/modelApi.js'
import { CellFallback, CellScene, CinematicLayerVisual, ViewerErrorBoundary } from '../viewer/CellViewer.jsx'

function ViewerControls({ crossSection, setCrossSection, viewMode, setViewMode }) {
  const modes = [
    { id: 'solid', icon: Box, label: 'Solid' },
    { id: 'layers', icon: Layers3, label: 'Layers' },
    { id: 'focus', icon: CircleDot, label: 'Focus' },
  ]

  return (
    <div className="viewer-controls">
      <span>View Mode</span>
      <div className="mode-buttons">
        {modes.map((mode) => {
          const Icon = mode.icon
          return (
            <button
              key={mode.id}
              type="button"
              className={viewMode === mode.id ? 'active' : ''}
              onClick={() => setViewMode(mode.id)}
              title={mode.label}
            >
              <Icon size={17} />
            </button>
          )
        })}
      </div>
      <label className="toggle-row">
        <span>Cross-Section</span>
        <input type="checkbox" checked={crossSection} onChange={(event) => setCrossSection(event.target.checked)} />
        <i />
      </label>
    </div>
  )
}

export function CenterStage({ selectedCell, selectedOrganelle, setSelectedOrganelle, crossSection, setCrossSection, renderQuality, customCells, onNotify, onExport, onExporterReady, onRetryGeneration, onOpenInspector }) {
  const [viewMode, setViewMode] = useState('layers')
  const [autoRotate, setAutoRotate] = useState(false)
  const [isIsolated, setIsIsolated] = useState(false)
  const [hideOthers, setHideOthers] = useState(false)
  const [proofMode, setProofMode] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)
  const [capturePulse, setCapturePulse] = useState(false)
  const [viewerError, setViewerError] = useState(null)
  const cell = getCell(selectedCell, customCells)
  const modelCellId = cell.custom ? cell.template : selectedCell
  const referenceImageUrl = cell.custom ? cell.imageUrl : ''
  const generatedModelUrl = getGeneratedModelUrl(cell)
  const generation = cell.custom ? cell.generation : null
  const generationProviderLabel = getProviderLabel(generation?.provider)
  const generationFailureTitle = generation?.requestedProvider === 'auto' ? '3D generation failed' : `${generationProviderLabel} generation failed`
  const isCinematicCell = cell.custom && generation?.provider === 'cinematic'
  const detail = getOrganelleDetail(selectedCell, selectedOrganelle, customCells)
  const webglAvailable = canUseWebGL()
  const generationPending = cell.custom && !generatedModelUrl && generation?.status && !['failed', 'local'].includes(generation.status)
  const generationFailed = cell.custom && !generatedModelUrl && generation?.status === 'failed'
  const stageStatusText = isCinematicCell
    ? `JS image relief · ${autoRotate ? 'Auto orbit' : 'Manual orbit'} · ${viewMode}`
    : `${generatedModelUrl ? `${generationProviderLabel} GLB loaded` : generationFailed ? `${generationProviderLabel} failed; source image shown` : referenceImageUrl ? `${generationProviderLabel} ${generation?.status || 'pending'}` : webglAvailable ? 'WebGL live 3D' : 'Fallback image'} · ${autoRotate || proofMode ? 'Auto rotate' : 'Manual orbit'} · ${viewMode}`
  const referenceLabel = isCinematicCell
    ? 'Source image used for browser-side JS depth relief'
    : generatedModelUrl
    ? `Source image used for ${generationProviderLabel} 3D generation`
    : `Source image for ${generationProviderLabel} generation`
  const viewerResetKey = `${selectedCell}-${generatedModelUrl}-${generation?.provider || 'built-in'}-${resetNonce}`
  const activeViewerError = viewerError?.key === viewerResetKey ? viewerError.message : ''
  const viewerFallback = (
    <CellFallback
      selectedCell={selectedCell}
      modelCellId={modelCellId}
      referenceImageUrl={referenceImageUrl}
      selectedOrganelle={selectedOrganelle}
      onSelectOrganelle={setSelectedOrganelle}
    />
  )

  function handleRotate() {
    const next = !autoRotate
    setAutoRotate(next)
    onNotify(next ? 'Auto rotate enabled' : 'Auto rotate paused')
  }

  function handleIsolate() {
    const next = !isIsolated
    setIsIsolated(next)
    if (next) setViewMode('focus')
    onNotify(next ? `${detail.title} focus mode` : 'Focus mode off')
  }

  function handleHideOthers() {
    const next = !hideOthers
    setHideOthers(next)
    onNotify(next ? `Showing ${detail.title} with cell shell` : 'All structures visible')
  }

  function handleResetView() {
    setAutoRotate(false)
    setIsIsolated(false)
    setHideOthers(false)
    setProofMode(false)
    setViewMode('layers')
    setResetNonce((value) => value + 1)
    onNotify('View reset')
  }

  function handleProofMode() {
    const next = !proofMode
    setProofMode(next)
    if (next) {
      setViewMode('focus')
      setHideOthers(false)
      setAutoRotate(true)
      onOpenInspector?.()
    }
    onNotify(next ? 'Inspection mode enabled' : 'Inspection mode off')
  }

  async function handleScreenshot() {
    const ok = isCinematicCell && referenceImageUrl
      ? (webglAvailable ? downloadCanvasImage(`${selectedCell}-${selectedOrganelle}.png`) : await downloadLayeredPngSnapshot(referenceImageUrl, `${selectedCell}-${selectedOrganelle}.png`))
      : downloadCanvasImage(`${selectedCell}-${selectedOrganelle}.png`)
    setCapturePulse(true)
    window.setTimeout(() => setCapturePulse(false), 280)
    onNotify(ok ? 'Screenshot downloaded' : 'Screenshot unavailable in this browser')
  }

  function handleViewerError(error) {
    console.error(error)
    const message = error instanceof Error ? error.message : 'The saved 3D preview could not be loaded.'
    setViewerError({ key: viewerResetKey, message })
    onExporterReady?.(null)
    onNotify('3D preview unavailable; fallback view shown')
  }

  useEffect(() => {
    if (isCinematicCell) onExporterReady?.(null)
  }, [isCinematicCell, onExporterReady])

  return (
    <section className="stage-panel">
      <div className="stage-title">
        <div>
          <h1>{cell.name}</h1>
          <p>{cell.type}</p>
        </div>
      </div>
      <ViewerControls crossSection={crossSection} setCrossSection={setCrossSection} viewMode={viewMode} setViewMode={setViewMode} />
      <div className={`cell-viewer ${viewMode} ${isIsolated ? 'is-isolated' : ''} ${isCinematicCell ? 'cinematic-viewer' : ''}`}>
        <ViewerErrorBoundary resetKey={viewerResetKey} onError={handleViewerError} fallback={viewerFallback}>
          {isCinematicCell ? (
            <CinematicLayerVisual imageUrl={referenceImageUrl} selectedOrganelle={selectedOrganelle} onSelectOrganelle={setSelectedOrganelle} autoRotate={autoRotate || proofMode} />
          ) : (
            <>
              <CellFallback selectedCell={selectedCell} modelCellId={modelCellId} referenceImageUrl={referenceImageUrl} selectedOrganelle={selectedOrganelle} onSelectOrganelle={setSelectedOrganelle} />
              {!generationFailed && (
                <CellScene
                  key={`${selectedCell}-${resetNonce}`}
                  selectedCell={selectedCell}
                  modelCellId={modelCellId}
                  referenceImageUrl={referenceImageUrl}
                  generatedModelUrl={generatedModelUrl}
                  selectedOrganelle={selectedOrganelle}
                  crossSection={crossSection}
                  autoRotate={autoRotate}
                  hideOthers={hideOthers}
                  proofMode={proofMode}
                  renderQuality={renderQuality}
                  onSelectOrganelle={setSelectedOrganelle}
                  onExporterReady={onExporterReady}
                />
              )}
            </>
          )}
        </ViewerErrorBoundary>
      </div>
      {referenceImageUrl && (
        <div className="custom-reference-layer">
          <img src={referenceImageUrl} alt={`${cell.name} uploaded reference`} />
          <span>{referenceLabel}</span>
        </div>
      )}
      {generationPending && (
        <div className="generation-overlay">
          <strong>{generation.status === 'uploading' ? `Uploading to ${generationProviderLabel}` : `Generating with ${generationProviderLabel}`}</strong>
          <span>{generation.message || 'Waiting for AI-generated GLB...'}</span>
          <div className="generation-meter">
            <i />
          </div>
        </div>
      )}
      {generationFailed && (
        <div className="generation-overlay failed">
          <strong>{generationFailureTitle}</strong>
          <span>{generation.message || 'The saved upload failed before a GLB was returned.'}</span>
          <button type="button" onClick={() => onRetryGeneration?.(cell.id)}>Retry Generation</button>
        </div>
      )}
      {activeViewerError && !generationFailed && (
        <div className="generation-overlay failed">
          <strong>3D preview unavailable</strong>
          <span>{generatedModelUrl ? 'The saved GLB could not be loaded. Showing the saved source image or fallback cell instead.' : activeViewerError}</span>
          {cell.custom && !cell.reference && cell.imageUrl && <button type="button" onClick={() => onRetryGeneration?.(cell.id)}>Retry Generation</button>}
        </div>
      )}
      <div className="stage-status">
        {stageStatusText}
      </div>
      {capturePulse && <div className="capture-pulse" />}
      <div className="stage-toolbar">
        <button type="button" className={autoRotate ? 'active' : ''} onClick={handleRotate} aria-pressed={autoRotate}>
          <Move3D size={14} />
          Rotate
        </button>
        <button type="button" className={isIsolated ? 'active' : ''} onClick={handleIsolate} aria-pressed={isIsolated}>
          <Eye size={14} />
          Isolate
        </button>
        <button type="button" className={hideOthers ? 'active' : ''} onClick={handleHideOthers} aria-pressed={hideOthers}>
          <Layers3 size={14} />
          Hide Others
        </button>
        <button type="button" onClick={handleResetView}>
          <RotateCcw size={14} />
          Reset View
        </button>
        <button type="button" className={proofMode ? 'active proof-active' : ''} onClick={handleProofMode} aria-pressed={proofMode}>
          <Box size={14} />
          Inspect
        </button>
        <span />
        <button type="button" onClick={handleScreenshot}>
          <Camera size={14} />
          Screenshot
        </button>
        <button type="button" onClick={onExport}>
          <Upload size={14} />
          3D Export
        </button>
      </div>
    </section>
  )
}
