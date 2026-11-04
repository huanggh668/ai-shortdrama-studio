/// <reference types="vite/client" />

import type { AppAPI } from '@shared/types'

declare global {
  interface Window {
    api: AppAPI
  }
}

export {}
