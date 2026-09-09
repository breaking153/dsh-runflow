import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const privacyRules = [
  { kind: 'Windows absolute path', pattern: /(?<![\w])[A-Za-z]:[\\/](?![<${%])[^\s`"'<>]+/ },
  { kind: 'Personal or mounted absolute path', pattern: /(?<![\w~])\/(?:Users|home|root|mnt|Volumes)\/(?![<${])[^\s/`"'<>]+/ },
  { kind: 'Network share path', pattern: /(?<!\\)\\\\[A-Za-z0-9_.-]+\\[A-Za-z0-9_$.-]+/ },
  { kind: 'Private IPv4 address', pattern: /(?<![\d.])(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?![\d.])/ },
  { kind: 'Credential-shaped value', pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/ },
  { kind: 'Credential-bearing URL', pattern: /https?:\/\/[^\s/:<>]+:[^\s/@<>]+@/ },
  { kind: 'Private key block', pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
]

function findPrivacyIssues(source: string) {
  return source.split(/\r?\n/).flatMap((line, index) => privacyRules
    .filter(rule => rule.pattern.test(line))
    .map(rule => ({ line: index + 1, kind: rule.kind })))
}

describe('documentation privacy', () => {
  it.each([
    { name: 'Windows checkout', source: String.raw`cd C:\Projects\private-checkout` },
    { name: 'macOS home', source: '/Users/example-person/project' },
    { name: 'Linux home', source: '/home/example-person/project' },
    { name: 'network share', source: String.raw`\\example-host\private-share\project` },
    { name: 'private network address', source: 'http://192.168.1.23:3000' },
    { name: 'provider credential', source: `apiKey: sk-${'test'.repeat(10)}` },
    { name: 'URL credential', source: 'https://example-user:example-password@example.test' },
    { name: 'private key', source: '-----BEGIN PRIVATE KEY-----' },
  ])('detects $name without including its value in diagnostics', ({ source }) => {
    const issues = findPrivacyIssues(source)
    expect(issues.length).toBeGreaterThan(0)
    expect(Object.keys(issues[0]!)).toEqual(['line', 'kind'])
  })

  it('allows portable examples, public links, loopback, and requirement notation', () => {
    expect(findPrivacyIssues([
      'cd ../deepseek-harness',
      'pnpm dsh plugin --profile web add "link:../dsh-flow"',
      '~/.dsh_agent_workflow/output',
      '<project-path>/nodes and /home/<user>/project',
      'https://github.com/example-org/example-project',
      'http://localhost:3000 and http://127.0.0.1:3000',
      'FROM:/TO: format',
      'apiKey: process.env.API_KEY',
    ].join('\n'))).toEqual([])
  })

  it('keeps tracked and nonignored new Markdown free of machine paths and credential signatures', () => {
    const files = [...new Set(execFileSync('git', [
      'ls-files', '--cached', '--others', '--exclude-standard', '-z',
    ], { cwd: repositoryRoot, encoding: 'utf8' }).split('\0'))]
      .filter(file => /\.mdx?$/i.test(file))
      .filter(file => !/(^|\/)(?:\.git|node_modules|\.worktrees)\//.test(file))
      .filter(file => existsSync(resolve(repositoryRoot, file)))

    expect(files.length).toBeGreaterThan(0)
    // Report location and issue type only: failed checks must not echo secrets.
    const issues = files.flatMap(file => findPrivacyIssues(readFileSync(resolve(repositoryRoot, file), 'utf8'))
      .map(issue => ({ file, ...issue })))
    expect(issues, 'Use relative paths, generic placeholders, or environment variables in documentation.').toEqual([])
  })
})
