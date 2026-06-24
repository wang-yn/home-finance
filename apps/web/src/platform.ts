import { isTauri } from '@tauri-apps/api/core'

export function isAppRuntime() {
  return isTauri()
}
