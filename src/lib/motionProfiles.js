const MOTION_PROFILES = {
  road: {
    id: 'road',
    label: 'Road push-in',
    durationMs: 7800,
    description: 'Low front dolly, forward drift, and showroom reveal for cars.',
  },
  aircraft: {
    id: 'aircraft',
    label: 'Flight pass',
    durationMs: 7200,
    description: 'Banked fly-by with a light tracking camera for aircraft.',
  },
  vessel: {
    id: 'vessel',
    label: 'Naval cruise',
    durationMs: 8600,
    description: 'Slow side tracking and heavy mass movement for ships and carriers.',
  },
  specimen: {
    id: 'specimen',
    label: 'Specimen orbit',
    durationMs: 8200,
    description: 'Close inspection orbit for biological and organic subjects.',
  },
  product: {
    id: 'product',
    label: 'Studio reveal',
    durationMs: 7600,
    description: 'Product turntable with a push-in and detail pause.',
  },
}

const VESSEL_KEYWORDS = [
  'aircraft carrier',
  'aircraft car',
  'carrier',
  'warship',
  'destroyer',
  'ship',
  'vessel',
  'naval',
  'submarine',
  '航母',
  '航空母舰',
  '军舰',
  '驱逐舰',
  '舰',
  '船',
  '潜艇',
]

const AIRCRAFT_KEYWORDS = [
  'fighter jet',
  'fighter',
  'airplane',
  'aeroplane',
  'aircraft',
  'plane',
  'jet',
  'drone',
  'helicopter',
  'missile',
  '战斗机',
  '飞机',
  '歼',
  '轰炸机',
  '无人机',
  '直升机',
  '导弹',
]

const ROAD_KEYWORDS = [
  'supercar',
  'ferrari',
  'lamborghini',
  'porsche',
  'tesla',
  'sports car',
  'race car',
  'vehicle',
  'automobile',
  'car',
  'truck',
  'suv',
  'motorcycle',
  '汽车',
  '跑车',
  '赛车',
  '法拉利',
  '兰博基尼',
  '保时捷',
  '特斯拉',
  '卡车',
  '摩托',
]

const SPECIMEN_KEYWORDS = [
  'cell',
  'biology',
  'biological',
  'organism',
  'specimen',
  'plant',
  'neuron',
  'bacteria',
  'blood',
  'epithelial',
  'muscle',
  'mosquito',
  '细胞',
  '生物',
  '植物',
  '神经',
  '细菌',
  '肌肉',
]

export function inferMotionProfile(cell = {}) {
  if (MOTION_PROFILES[cell.motionProfile]) return MOTION_PROFILES[cell.motionProfile]

  const primaryText = normalizeSearchText([
    cell.id,
    cell.fullName,
    cell.sourceFileName,
    cell.name,
    cell.type,
    cell.template,
  ])
  const secondaryText = normalizeSearchText([
    cell.referenceSummary,
    cell.referenceSource,
    cell.imageUrl,
    cell.thumbnailUrl,
    cell.generation?.provider,
    cell.generation?.message,
    cell.generation?.modelUrl,
    cell.generation?.rawModelUrl,
  ])
  const scores = {
    vessel: scoreKeywords(primaryText, VESSEL_KEYWORDS, 8) + scoreKeywords(secondaryText, VESSEL_KEYWORDS, 2),
    aircraft: scoreKeywords(primaryText, AIRCRAFT_KEYWORDS, 8) + scoreKeywords(secondaryText, AIRCRAFT_KEYWORDS, 2),
    road: scoreKeywords(primaryText, ROAD_KEYWORDS, 8) + scoreKeywords(secondaryText, ROAD_KEYWORDS, 2),
    specimen: scoreKeywords(primaryText, SPECIMEN_KEYWORDS, 5) + scoreKeywords(secondaryText, SPECIMEN_KEYWORDS, 1),
  }

  if (hasKeyword(primaryText, ['aircraft carrier', 'aircraft car', '航母', '航空母舰'])) {
    scores.vessel += 14
    scores.aircraft -= 8
  }

  if (hasKeyword(primaryText, ['supercar', 'sports car', 'race car', 'ferrari', 'lamborghini', 'porsche', '跑车', '赛车', '法拉利', '兰博基尼', '保时捷'])) {
    scores.road += 14
    scores.aircraft -= 6
  }

  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  if (winner?.[1] > 0) return MOTION_PROFILES[winner[0]]

  return MOTION_PROFILES.product
}

export function getMotionProfile(profileId) {
  return MOTION_PROFILES[profileId] || MOTION_PROFILES.product
}

function normalizeSearchText(parts) {
  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
}

function hasKeyword(text, keywords) {
  return keywords.some((keyword) => matchesKeyword(text, keyword))
}

function scoreKeywords(text, keywords, weight) {
  return keywords.reduce((score, keyword) => (matchesKeyword(text, keyword) ? score + weight : score), 0)
}

function matchesKeyword(text, keyword) {
  if (!text || !keyword) return false
  const normalizedKeyword = keyword.toLowerCase()
  if (/[a-z0-9]/i.test(normalizedKeyword)) {
    const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)
  }

  return text.includes(normalizedKeyword)
}
