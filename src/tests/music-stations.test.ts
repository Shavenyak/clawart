import { describe, expect, it } from 'vitest'
import { getMusicStation, MUSIC_STATIONS } from '../audio/musicStations'

describe('music stations', () => {
  it('keeps stable ids and secure stream URLs for the listening corner presets', () => {
    expect(MUSIC_STATIONS).toHaveLength(4)
    expect(new Set(MUSIC_STATIONS.map((station) => station.id)).size).toBe(MUSIC_STATIONS.length)
    expect(MUSIC_STATIONS.every((station) => station.streamUrl.startsWith('https://'))).toBe(true)
    expect(MUSIC_STATIONS.every((station) => station.sourceUrl.startsWith('https://'))).toBe(true)
  })

  it('resolves known station ids and rejects invalid ones', () => {
    expect(getMusicStation('radio-rock')?.label).toBe('Classic Rock')
    expect(getMusicStation('missing-station')).toBeNull()
  })
})
