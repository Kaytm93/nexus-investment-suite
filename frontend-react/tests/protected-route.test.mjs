import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(join(here, '..', 'src', 'App.jsx'), 'utf8')

test('ProtectedRoute imports the useAuth hook it calls', () => {
  const authImport = appSource.match(
    /import\s+\{([^}]+)\}\s+from\s+['"]\.\/context\/AuthContext['"]/
  )

  assert.ok(authImport, 'App.jsx must import from AuthContext')
  assert.match(authImport[1], /\buseAuth\b/)
  assert.match(appSource, /function ProtectedRoute\(\{ children \}\)/)
  assert.match(appSource, /const \{ user, loading \} = useAuth\(\)/)
})
