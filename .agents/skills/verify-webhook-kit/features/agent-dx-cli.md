# Feature: Agent DX & CLI Tooling

## Sub-features
- Command-line interface `webhook-kit` (`init-agent`, `version`, `help`).
- Automatic detection of `AGENTS.md`, `CLAUDE.md`, or custom target path.
- Idempotent rule synchronization (updates existing block without duplication).

## How to get to it (user POV)
A developer runs `npx webhook-kit init-agent` inside their project to prevent AI coding assistants from generating broken JSON re-stringification patterns.

## Driving it with CLI
Run:
```bash
node ./bin/webhook-kit.mjs --help
node ./bin/webhook-kit.mjs init-agent --target /tmp/test-agent-drive.md
grep -q "webhook-kit-agent-rules:start" /tmp/test-agent-drive.md
rm /tmp/test-agent-drive.md
```

## Gotchas
- The CLI must remain zero-dependency (`node:fs`, `node:path`, `node:process`).
- Must preserve existing file content when appending or replacing the rule block.
