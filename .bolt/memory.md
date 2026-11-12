# Project memory

## Product intent & audience

- Gaming/betting application where human users play against AI bots
- Admin can configure a global "win rate" percentage to control bot strength vs players
- Target audience: Filipino users (communication in Tagalog/Filipino)

## Brand personality & voice

- Assistant communicates with user in Tagalog/Filipino
- Technical explanations mixed with conversational Filipino

## Visual design & UX direction

- Admin panel includes win rate control with labels indicating bot/player strength
- Labels must correctly reflect: high % = player-favorable, low % = bot-favorable

## Decisions, constraints & rationale

- Win rate semantics (corrected):
  - 100% = bots play weakest; all players/users win nearly always
  - 50% = balanced/fair play
  - 0% = bots play strongest; players lose majority
  - Below 50% → bots stronger than player → more losses
  - Above 50% → bots weaker than player → more wins
- Original bug: `pressure` function was inverted (100 = strongest bots, 0 = weakest bots) — fixed to match user intent
- Key files: `bots.ts` (bot logic + pressure function), `session.ts` (session handling), admin panel (UI labels), test file
- Project is distributed as a zip; working directory may reset between turns (changes can be lost)
- Test suite: 56 tests, all passing after fix

## Open questions & assumptions

- Whether per-user or per-session win rate overrides are needed (currently appears global)
- Exact game type/rules not yet detailed in context
- Whether project will persist outside zip distribution in future turns