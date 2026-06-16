/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAdminToken,
  clearMemberToken,
  loadAdminToken,
  loadMemberToken,
  loadServiceUrl,
  saveAdminToken,
  saveMemberToken,
  saveServiceUrl,
} from './session'

beforeEach(() => {
  localStorage.clear()
})

describe('session storage', () => {
  it('uses the local API URL by default', () => {
    expect(loadServiceUrl()).toBe('http://localhost:8080')
  })

  it('stores values under homeFinance-prefixed keys', () => {
    saveServiceUrl('http://192.0.2.10:8080')
    saveMemberToken('member-token')
    saveAdminToken('admin-token')

    expect(localStorage.getItem('homeFinance.serviceUrl')).toBe('http://192.0.2.10:8080')
    expect(localStorage.getItem('homeFinance.memberToken')).toBe('member-token')
    expect(localStorage.getItem('homeFinance.adminToken')).toBe('admin-token')
  })

  it('loads and clears member and admin tokens', () => {
    saveMemberToken('member-token')
    saveAdminToken('admin-token')

    expect(loadMemberToken()).toBe('member-token')
    expect(loadAdminToken()).toBe('admin-token')

    clearMemberToken()
    clearAdminToken()

    expect(loadMemberToken()).toBeNull()
    expect(loadAdminToken()).toBeNull()
  })
})
