/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAppRuntime } from './platform'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('platform detection', () => {
  it('treats a normal browser runtime as web', () => {
    expect(isAppRuntime()).toBe(false)
  })

  it('detects the packaged Tauri runtime', () => {
    vi.stubGlobal('isTauri', true)

    expect(isAppRuntime()).toBe(true)
  })
})
