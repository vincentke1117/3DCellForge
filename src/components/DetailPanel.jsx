import { Heart } from 'lucide-react'

import { getOrganelleDetail } from '../domain/cellCatalog.js'

export function DetailPanel({ selectedCell, selectedOrganelle, favoriteKey, setFavoriteKey, customCells, onNotify }) {
  const detail = getOrganelleDetail(selectedCell, selectedOrganelle, customCells)
  const currentKey = `${selectedCell}:${selectedOrganelle}`
  const isFavorite = favoriteKey === currentKey

  function toggleFavorite() {
    const next = isFavorite ? '' : currentKey
    setFavoriteKey(next)
    onNotify(isFavorite ? `${detail.title} removed from favorites` : `${detail.title} saved to favorites`)
  }

  return (
    <aside className="right-rail">
      <section className="panel detail-panel">
        <header className="detail-title">
          <span>Organelle Details</span>
          <button type="button" className={isFavorite ? 'detail-fav active' : 'detail-fav'} onClick={toggleFavorite} aria-pressed={isFavorite}>
            <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </header>
        <div className="detail-heading">
          <div className="cluster-icon" style={{ '--cluster': detail.accent }}>
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <h2>{detail.title}</h2>
            <p>{detail.subtitle}</p>
          </div>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Size</dt>
            <dd>{detail.size}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{detail.location}</dd>
          </div>
          <div>
            <dt>Visible in LM</dt>
            <dd>{detail.visible}</dd>
          </div>
          <div>
            <dt>Marker</dt>
            <dd>
              <span className="color-dot" style={{ background: detail.accent }} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel notes-panel">
        <header className="panel-title">
          <span>Biological Notes</span>
        </header>
        <p>{detail.note}</p>
        <blockquote>{detail.funFact ?? 'Some white blood cells can change shape to squeeze between blood vessel walls and reach infected tissue.'}</blockquote>
      </section>
    </aside>
  )
}
