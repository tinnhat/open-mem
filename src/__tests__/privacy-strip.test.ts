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

  it('redacts AWS access key IDs', () => {
    const awsKey = 'AKIAIOSFODNN7EXAMPLE'
    expect(stripSensitiveData(`AWS access key: ${awsKey}`)).toContain('[REDACTED]')
  })

  it('redacts AWS secret access keys', () => {
    const input = 'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
    expect(stripSensitiveData(input)).toContain('[REDACTED]')
  })

  it('redacts GCP API keys', () => {
    const gcpKey = 'AIzaSyD7Qm8C7XfRvYdqM7Q2Q3K5L6FpR4XsKc'
    expect(stripSensitiveData(`GCP key: ${gcpKey}`)).toContain('[REDACTED]')
  })

  it('redacts SSH private keys', () => {
    const sshKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQ...\n-----END RSA PRIVATE KEY-----'
    expect(stripSensitiveData(sshKey)).toContain('[REDACTED]')
  })

  it('redacts JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.Dignature'
    expect(stripSensitiveData(`Bearer ${jwt}`)).toContain('[REDACTED]')
  })

  it('redacts generic secret patterns', () => {
    expect(stripSensitiveData('secret=mySuperSecretPassword123')).toContain('[REDACTED]')
    expect(stripSensitiveData('access_token=ghp_abc123xyz')).toContain('[REDACTED]')
  })

  it('redacts GitHub token patterns', () => {
    expect(stripSensitiveData('github_token=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toContain('[REDACTED]')
  })

  it('redacts Stripe test keys', () => {
    expect(stripSensitiveData('sk_test_AbCdEfGhIjKlMnOpQrStUvWxYz123')).toContain('[REDACTED]')
    expect(stripSensitiveData('pk_test_AbCdEfGhIjKlMnOpQrStUvWxYz123')).toContain('[REDACTED]')
  })
})