---
name: shadcn-ui-ux
description: "Guidelines and best practices for leveraging the shadcn Model Context Protocol (MCP) server, custom registries (e.g., @acme, third-party component libraries), and design system standards for UI/UX refinement in modern React, Tailwind CSS, and TypeScript applications."
license: MIT
metadata:
  author: QLess / Antigravity Agent
  version: "1.0.0"
  abstract: "Operating guidelines for AI coding assistants to discover, install, customize, and refine UI/UX components using shadcn MCP, custom registries, and production-grade design systems."
---

# shadcn UI/UX Refinement Skill

This skill provides instructions for AI agents and developers to build, refine, and maintain polished, commercial-quality user interfaces using the **shadcn MCP server**, custom component registries, and modern design principles.

---

## 1. When to Use This Skill

Activate this skill when:
- Designing or refining UI/UX components across customer, cashier, admin, or security interfaces.
- Browsing, querying, or installing components from standard `shadcn/ui` or custom registries (such as `@acme` or private component catalogs).
- Establishing or enforcing consistent design system tokens (colors, typography, spacing, border radiuses, animations).
- Replacing ad-hoc styles or legacy emoji UI with accessible, production-grade components.

---

## 2. MCP Server Configuration

The official shadcn MCP server allows AI assistants to search, view documentation, and install components dynamically via natural language.

### VS Code Configuration (`.vscode/mcp.json`)
```json
{
  "servers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

### Antigravity / Claude / Cursor Configuration (`~/.gemini/antigravity/mcp_config.json`)
```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

---

## 3. Custom Registries Architecture (`components.json`)

Custom and private component registries are defined in `components.json` using the `registries` dictionary.

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {
    "@acme": "https://acme.com/r/{name}.json"
  }
}
```

### Installing Components from Registries
- From standard shadcn registry:
  ```bash
  npx shadcn@latest add button dialog dropdown-menu
  ```
- From a configured registry (`@acme`):
  ```bash
  npx shadcn@latest add @acme/button
  npx shadcn@latest add @acme/stock-modal
  ```
- Directly from a remote URL registry:
  ```bash
  npx shadcn@latest add "https://acme.com/r/data-table.json"
  ```

---

## 4. UI/UX Refinement Principles (Apple & Stripe Inspired)

When building or refining interfaces:

1. **Clean Canvas & Elevated Whitespace**:
   - Avoid noisy background photos or heavy glassmorphism filters.
   - Use crisp, subtle neutral backgrounds (`#F8FAFC` / `bg-slate-50`).
   - Cards should use pure white (`#FFFFFF`) with thin, high-clarity borders (`border-slate-200/80`) and subtle shadows (`shadow-xs` / `shadow-sm`).

2. **Palette & Color Contrast**:
   - **Primary Action & Text**: Obsidian / Slate 900 (`#101828` or `#0F172A`).
   - **Accent & Highlights**: Emerald Green (`#16A34A` / `#22C55E`) for successful states, verified passes, and cash settlements.
   - **Warning / Alert**: Amber (`#D97706`) and Crimson (`#DC2626`) with soft tinted background containers (`bg-amber-50`, `bg-red-50`).
   - **Secondary Text**: Cool Gray / Slate 500 (`#64748B`).

3. **Typography Hierarchy**:
   - Headers: Bold, geometric or humanist sans-serif with tight tracking (`tracking-tight`, font weights 600/700).
   - Monospace: Reserve for financial references, order IDs, barcode scans, and tax identifiers (`font-mono font-semibold`).

4. **Micro-Interactions & Accessibility**:
   - All interactive elements must have clear focus rings, hover transitions (`transition duration-150`), and tactile active press feedback (`active:scale-[0.98]`).
   - Modals and dialogs must implement `aria-modal="true"`, background blur backdrop (`backdrop-blur-xs`), ESC key dismissal, and backdrop click handlers.

5. **Utility Class Composition**:
   - Always merge dynamic classes using the `cn(...)` utility (`clsx` + `twMerge`) located at `@/lib/utils`.

