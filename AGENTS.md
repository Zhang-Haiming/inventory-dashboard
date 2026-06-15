<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:code-review-rules -->
# Code Review Rules

When I say "review this", switch to code review mode focused on this kanban app for small business (≤5 users).

**High Priority**
- Business logic correctness: verify that status transitions, workflow rules, and board operations behave as intended
- Excel/data binding: ensure linked Excel entries map to the correct fields, rows are not off-by-one, and column references are accurate
- Financial calculation accuracy: double-check all amount calculations, rounding behavior, and aggregation logic (sum, subtotal, tax, etc.)
- Edge cases: empty cells, missing values, zero amounts, and duplicate entries should be handled gracefully

**Low Priority / Can Ignore**
- Performance optimization (5-user scale is not a bottleneck)
- Complex design patterns

Give a direct verdict: "needs fix" or "good to go". Flag financial logic issues with high urgency.
<!-- END:code-review-rules -->
