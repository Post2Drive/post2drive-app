---
name: nextjs
description: Next.js 14+ App Router patterns, Server Components, API routes, and performance optimization
metadata:
  version: "1.1.0"
---

## Next.js Code Review Rules

### Security (Critical)
- **Template Variable Safety**: Never use template variables (`{{...}}`) or undeclared variables in Next.js code. Ensure all variables are declared and sanitized. Explicitly check for undeclared variables and reject or escape them
- **Comment Hygiene**: Never use HTML comments (`<!-- -->`) in production code. If template variables are required, specify safe rendering practices and ensure all variables are declared and sanitized
- **Input Handling**: When interpolating values (e.g., template variables), ensure escaping and avoid using undeclared variables or patterns like `{{...}}`. Never trust or directly render user-provided templates
- **Validation**: Verify sanitation/validation for variables in all contexts (API, rendering, headers). Explicitly check for undeclared variables, dynamic content passed into critical APIs, and ensure proper escaping/sanitizing at each layer
- Server Actions must validate and sanitize all input
- No secrets exposed in client components
- Check `headers()` and `cookies()` usage is server-side only
- Sanitize all dynamic values (file names, HTTP headers) to prevent injection attacks
- Validate and escape all user-provided content before rendering

### App Router Structure (Essential)
- Verify `app/` directory structure follows conventions (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`)
- Check `use client` directive is only used when necessary (event handlers, hooks, browser APIs)
- Server Components should not import client-only libraries (useState, useEffect, etc.)

### App Router Structure (Advanced)
- Implement error boundaries with `error.tsx` for error handling
- Use error boundaries to catch and handle errors in Server Components
- Provide fallback UIs for errors with proper error messages

### Data Fetching (Essential)
- Prefer Server Components for data fetching over client-side fetching
- Check for proper use of `cache()` for request deduplication
- Validate `revalidate` options for ISR (Incremental Static Regeneration)
- Ensure `generateStaticParams()` is used for static generation of dynamic routes

### Performance (Essential)
- Images must use `next/image` with explicit `width`/`height` or `fill`
- Fonts should use `next/font` for automatic optimization
- Check for proper `Suspense` boundaries around async components
- Verify no blocking data fetches in layouts (affects all child routes)

### API Routes (Essential)
- Validate HTTP methods (check `req.method` or use route handlers)
- Implement authentication and authorization
- Return appropriate HTTP status codes
- Handle errors gracefully with try-catch
- Sanitize and validate all inputs
- Use proper CORS headers when needed

### Accessibility
- Use semantic HTML elements
- Include `alt` text on all images
- Ensure keyboard navigation works
- Test with screen readers
- Maintain proper heading hierarchy
- Add ARIA labels where needed

### Testing
- Write unit tests for critical components
- Test Server Components and Server Actions
- Use integration tests for data fetching flows
- Test error boundaries and error states
- Include e2e tests for critical user flows
- Validate test coverage for mission-critical features

### Dependencies
- Keep Next.js and React versions compatible
- Check for breaking changes when updating
- Audit third-party packages for security and compatibility
- Use official Next.js plugins when available
- Avoid excessive dependencies for simple functionality

### Edge Runtime (Advanced)
- Review usage of Edge runtime for API routes
- Ensure Edge-compatible code (no Node.js-specific APIs)
- Use Edge runtime for latency-sensitive operations
- Be aware of Edge runtime limitations (memory, execution time)
- Test Edge functions thoroughly

### Common Anti-patterns
- Avoid `use client` at layout level (makes all children client components)
- Avoid fetching same data in multiple components (use cache or pass as props)
- Avoid `dynamic = 'force-dynamic'` without justification


---

> Upstream source: https://github.com/yldgio/codereview-skills/blob/main/skills/nextjs/SKILL.md
> Imported into Post2Drive as a project-local skill; review upstream before refreshing.
