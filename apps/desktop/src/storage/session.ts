const serviceUrlKey = 'homeFinance.serviceUrl'
const memberTokenKey = 'homeFinance.memberToken'
const adminTokenKey = 'homeFinance.adminToken'

export function loadServiceUrl() {
  return localStorage.getItem(serviceUrlKey) || 'http://localhost:8080'
}

export function saveServiceUrl(value: string) {
  localStorage.setItem(serviceUrlKey, value)
}

export function loadMemberToken() {
  return localStorage.getItem(memberTokenKey)
}

export function saveMemberToken(value: string) {
  localStorage.setItem(memberTokenKey, value)
}

export function clearMemberToken() {
  localStorage.removeItem(memberTokenKey)
}

export function loadAdminToken() {
  return localStorage.getItem(adminTokenKey)
}

export function saveAdminToken(value: string) {
  localStorage.setItem(adminTokenKey, value)
}

export function clearAdminToken() {
  localStorage.removeItem(adminTokenKey)
}
