# ChiroFlow Ralph Autonomous Loop

Continue the Ralph autonomous loop. Read prd.json and progress.txt to understand current state.

## Project Context

ChiroFlow is a full-featured EHR (Electronic Health Record) application for chiropractic practices built with:
- **Frontend**: Next.js 16 with React, TypeScript, Tailwind CSS
- **Backend**: tRPC API routes with Prisma ORM
- **Database**: PostgreSQL
- **Auth**: NextAuth.js
- **UI**: shadcn/ui components

Key directories:
- `app/src/app/` - Next.js App Router pages
- `app/src/components/` - React components
- `app/src/server/routers/` - tRPC API routers
- `app/prisma/` - Prisma schema and migrations
- `app/src/lib/` - Utility libraries and services

Brand colors:
- Primary dark blue: #053e67
- Accent red: #c90000

## Your Task

1. Find the FIRST story where "passes" is false in prd.json
2. Implement that ONE story completely following the acceptance criteria
3. Ensure code compiles without errors
4. Update progress.txt with what you did
5. Commit the changes with message "feat: [story-id] - [title]"
6. Update prd.json to mark the story as "passes": true

## Implementation Guidelines

- Follow existing code patterns in the codebase
- Use shadcn/ui components from `@/components/ui/`
- Create tRPC routers in `app/src/server/routers/`
- Add router to `app/src/server/routers/index.ts`
- For schema changes, update `app/prisma/schema.prisma` and run migrations
- Use the existing auth context and organization scoping
- Export new components from appropriate index files

## Exit Signals

If ALL stories have "passes": true, output exactly:
```
<promise>COMPLETE</promise>
EXIT_SIGNAL: true
```

If there are still stories to complete, output:
```
EXIT_SIGNAL: false
STORIES_REMAINING: [count]
```

## Important

- Work autonomously. Do not ask questions.
- Make reasonable decisions based on existing patterns.
- If a dependency is missing, implement a minimal version.
- Focus on completing ONE story per iteration.
