import { describe, it, expect } from 'vitest'
import { stripSensitiveData } from '../privacy/strip.js'

describe('stripSensitiveData', () => {
  it('returns unchanged text with no sensitive data', () => {
    const input = 'This is a normal message with no secrets.'
    expect(stripSensitiveData(input)).toBe(input)
  })

  it('redacts <private> blocks', () => {
    const input = 'Before <private>secret content</private> after'
    expect(stripSensitiveData(input)).toBe('Before [REDACTED] after')
  })

  it('redacts api_key patterns', () => {
    expect(stripSensitiveData('api_key = "abc123xyz"')).toContain('[REDACTED]')
    expect(stripSensitiveData('api-key: mySecretKey')).toContain('[REDACTED]')
    expect(stripSensitiveData('API_KEY="somevalue"')).toContain('[REDACTED]')
  })

  it('redacts apikey patterns', () => {
    expect(stripSensitiveData('apikey = "secret123"')).toContain('[REDACTED]')
  })

  it('redacts password patterns', () => {
    expect(stripSensitiveData('password = "mysecret"')).toContain('[REDACTED]')
    expect(stripSensitiveData('passwd: hunter2')).toContain('[REDACTED]')
  })

  it('redacts token patterns', () => {
    expect(stripSensitiveData('token = "abc-def-123"')).toContain('[REDACTED]')
    expect(stripSensitiveData('bearer = "myBearerToken"')).toContain('[REDACTED]')
  })

  it('redacts OpenAI sk- keys', () => {
    const key = 'sk-' + 'a'.repeat(25)
    expect(stripSensitiveData(`Using key: ${key}`)).toContain('[REDACTED]')
  })

  it('redacts GitHub personal access tokens', () => {
    const token = 'ghp_' + 'A'.repeat(36)
    expect(stripSensitiveData(`token: ${token}`)).toContain('[REDACTED]')
  })

  it('redacts Slack tokens', () => {
    expect(stripSensitiveData('xoxb-abcdefghij0')).toContain('[REDACTED]')
    expect(stripSensitiveData('xoxp-abcdefghij0')).toContain('[REDACTED]')
  })

  it('redacts ENV assignment patterns', () => {
    expect(stripSensitiveData('ENV["SECRET"] = "value"')).toContain('[REDACTED]')
    expect(stripSensitiveData("ENV_VARS[\"KEY\"] = 'value'")).toContain('[REDACTED]')
  })

  it('redacts multiple patterns in one string', () => {
    const input = 'api_key="abc123" and password="hunter2"'
    const result = stripSensitiveData(input)
    expect(result).not.toContain('abc123')
    expect(result).not.toContain('hunter2')
    expect(result.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('does not redact short sk- patterns', () => {
    const short = 'sk-short'
    const result = stripSensitiveData(short)
    expect(result).toBe(short)
  })
})