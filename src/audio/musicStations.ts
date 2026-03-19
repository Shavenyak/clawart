import type { MusicStation } from '../types'

export const MUSIC_STATIONS: MusicStation[] = [
  {
    id: 'radio-80s',
    label: '80s Hits',
    genre: 'Retro Pop',
    description: '80s80s live stream with classic 1980s pop and new wave.',
    streamUrl: 'https://streams.80s80s.de/80s80sDAB/mp3-128/streams.80s80s.de/',
    sourceUrl: 'https://streams.80s80s.de/',
    accentColor: '#ff5d8a',
  },
  {
    id: 'radio-classical',
    label: 'Radio Swiss Classic',
    genre: 'Classical',
    description: 'Radio Swiss Classic official MP3 stream.',
    streamUrl: 'https://stream.srg-ssr.ch/srgssr/rsc_de/mp3/128',
    sourceUrl: 'https://www.radioswissclassic.ch/en/reception/internet',
    accentColor: '#f2c66f',
  },
  {
    id: 'radio-rock',
    label: 'Classic Rock',
    genre: 'Rock',
    description: 'RADIO BOB! Classic Rock official stream.',
    streamUrl: 'https://streams.radiobob.de/classicrock/mp3-192/streams.radiobob.de/',
    sourceUrl: 'https://streams.radiobob.de/',
    accentColor: '#7db7ff',
  },
  {
    id: 'radio-metal',
    label: 'BOBs Metal',
    genre: 'Metal',
    description: 'RADIO BOB! metal stream with heavier tracks.',
    streamUrl: 'https://streams.radiobob.de/bob-metal/aac-64/streams.radiobob.de/',
    sourceUrl: 'https://streams.radiobob.de/',
    accentColor: '#c16dff',
  },
]

const stationById = new Map(MUSIC_STATIONS.map((station) => [station.id, station]))

export function getMusicStation(stationId: string | null | undefined): MusicStation | null {
  if (!stationId) {
    return null
  }

  return stationById.get(stationId) ?? null
}
