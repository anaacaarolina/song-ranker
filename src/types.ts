export interface Track {
  id: string
  name: string
  artists: string
  albumName: string
  albumImageUrl: string | null
  previewUrl: string | null
  uri: string
  externalUrl: string
}

export interface User {
  id: string
  displayName: string
  imageUrl: string | null
}

export interface PlaylistMeta {
  id: string
  name: string
  ownerName: string
  ownerId: string
  imageUrl: string | null
  totalTracks: number
}
