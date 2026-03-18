import type { GalleryImage } from '../types'

const defaultFamilyPhotos = [
  {
    label: 'Obama Family Garden Portrait',
    textureUrl: new URL('../assets/open-license/open-01.jpg', import.meta.url).href,
    orientation: 'landscape',
  },
  {
    label: 'Obama Family Portrait 2011',
    textureUrl: new URL('../assets/open-license/open-02.jpg', import.meta.url).href,
    orientation: 'landscape',
  },
  {
    label: 'First Family 2013',
    textureUrl: new URL('../assets/open-license/open-03.jpg', import.meta.url).href,
    orientation: 'landscape',
  },
  {
    label: 'Migrant Mother',
    textureUrl: new URL('../assets/open-license/open-04.jpg', import.meta.url).href,
    orientation: 'portrait',
  },
  {
    label: 'Obama Family Square Crop',
    textureUrl: new URL('../assets/open-license/open-05.jpg', import.meta.url).href,
    orientation: 'square',
  },
  {
    label: 'Obama Family Portrait Crop',
    textureUrl: new URL('../assets/open-license/open-06.jpg', import.meta.url).href,
    orientation: 'square',
  },
  {
    label: 'First Family Square Crop',
    textureUrl: new URL('../assets/open-license/open-07.jpg', import.meta.url).href,
    orientation: 'square',
  },
  {
    label: 'Migrant Mother Square Crop',
    textureUrl: new URL('../assets/open-license/open-08.jpg', import.meta.url).href,
    orientation: 'square',
  },
  {
    label: 'Obama Family Close Crop',
    textureUrl: new URL('../assets/open-license/open-09.jpg', import.meta.url).href,
    orientation: 'square',
  },
  {
    label: 'Obama Family 2011 Close Crop',
    textureUrl: new URL('../assets/open-license/open-10.jpg', import.meta.url).href,
    orientation: 'square',
  },
  {
    label: 'First Family Close Crop',
    textureUrl: new URL('../assets/open-license/open-11.jpg', import.meta.url).href,
    orientation: 'square',
  },
  {
    label: 'Migrant Mother Close Crop',
    textureUrl: new URL('../assets/open-license/open-12.jpg', import.meta.url).href,
    orientation: 'square',
  },
  {
    label: 'Eric Stewart Family Portrait',
    textureUrl: new URL('../assets/open-license/open-13.jpg', import.meta.url).href,
    orientation: 'portrait',
  },
  {
    label: 'Stockton Family Portrait',
    textureUrl: new URL('../assets/open-license/open-14.jpg', import.meta.url).href,
    orientation: 'landscape',
  },
  {
    label: 'Family Drinking Juice',
    textureUrl: new URL('../assets/open-license/open-15.jpg', import.meta.url).href,
    orientation: 'landscape',
  },
  {
    label: 'Kennedy Family Portrait 1953',
    textureUrl: new URL('../assets/open-license/open-16.jpg', import.meta.url).href,
    orientation: 'landscape',
  },
  {
    label: 'Obama Family Garden Portrait Crop',
    textureUrl: new URL('../assets/open-license/open-17.jpg', import.meta.url).href,
    orientation: 'portrait',
  },
  {
    label: 'Obama Family Home Portrait Crop',
    textureUrl: new URL('../assets/open-license/open-18.jpg', import.meta.url).href,
    orientation: 'portrait',
  },
  {
    label: 'First Family 2013 Portrait Crop',
    textureUrl: new URL('../assets/open-license/open-19.jpg', import.meta.url).href,
    orientation: 'portrait',
  },
  {
    label: 'Family Drinking Juice Portrait Crop',
    textureUrl: new URL('../assets/open-license/open-20.jpg', import.meta.url).href,
    orientation: 'portrait',
  },
] as const

export function createPlaceholderGalleryImages(): GalleryImage[] {
  return defaultFamilyPhotos.map((photo, index) => ({
    id: `placeholder-${index + 1}`,
    label: photo.label,
    source: 'placeholder' as const,
    textureUrl: photo.textureUrl,
    orientation: photo.orientation,
  }))
}

export function mergeGalleryImages(
  placeholders: GalleryImage[],
  uploads: GalleryImage[],
): GalleryImage[] {
  return placeholders.map((placeholder, index) => uploads[index] ?? placeholder)
}
