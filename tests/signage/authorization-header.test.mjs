// node --test tests/signage/
// Uppladdningen i Signage.tsx (XHR) måste få Bearer-värdet även när Headers
// har lowercasat namnet. Se src/lib/authorizationHeader.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authorizationHeaderValue } from '../../src/lib/authorizationHeader.ts'

function sessionHeaders(token = 'session-token') {
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  return headers
}

test('uppladdningens Authorization-värde överlever att Headers lowercasar namnet', () => {
  const headers = sessionHeaders()
  const lowered = Object.fromEntries(headers.entries())
  assert.equal(lowered.Authorization, undefined)
  assert.equal(lowered.authorization, 'Bearer session-token')
  assert.equal(authorizationHeaderValue(headers), 'Bearer session-token')
})

test('Authorization läses skiftlägesokänsligt, som Headers.get', () => {
  const headers = new Headers()
  headers.set('authorization', 'Bearer abc')
  assert.equal(authorizationHeaderValue(headers), 'Bearer abc')
})

test('saknad Authorization-header ger null (session-felet kastas av staffAuthHeaders, inte här)', () => {
  assert.equal(authorizationHeaderValue(new Headers()), null)
})
