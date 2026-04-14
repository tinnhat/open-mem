# mem-search Skill

Use this skill to search your persistent memory.

## When to Use

- When user asks about past decisions, bugs, features
- When user wants to find related memories
- When context about previous sessions is needed

## Usage

```
You: @mem-search "authentication JWT"
```

## Commands

- `/mem search <query>` - Search memories by query
- `/mem timeline <id>` - Get context around observation
- `/mem recent` - List recent observations
- `/mem summary` - Get last session summary

## API

- GET http://localhost:37778/api/search?q=<query>
- GET http://localhost:37778/api/timeline?anchor=<id>
- GET http://localhost:37778/api/summaries/recent
