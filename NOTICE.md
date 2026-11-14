# Third-Party Notices

ORBO includes code and assets derived from open-source projects and depends on third-party
software. This file preserves the notices required by their licenses. ORBO itself is
proprietary (see `LICENSE`); the notices below are retained as their licenses require.

Upstream project names appear here and in `UPSTREAM.md` only. They must not appear in
first-party product code, UI, documentation, or configuration.

---

## 1. Derived works (MIT License)

ORBO is derived in part from the following MIT-licensed projects. Each copyright notice and
the shared MIT license text follow.

| Project | Repository | Copyright |
|---|---|---|
| OpenBot | https://github.com/CopilotKit/OpenBot | Copyright (c) 2026 CopilotKit |
| OpenMuse | https://github.com/CopilotKit/openmuse | Copyright (c) 2026 OpenMuse contributors |
| OpenDots | https://github.com/CopilotKit/OpenDots | Copyright (c) Atai Barkai |

### MIT License

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. Runtime service dependencies

These are mandatory external services / SDKs referenced at runtime. Their names and endpoints
cannot be renamed without rewriting the runtime; they are documented here as required.

- **CopilotKit Intelligence** — durable threads and memory persistence. Closed managed service.
  https://www.copilotkit.ai · https://intelligence.copilotkit.ai
- **CopilotKit SDKs** — `@copilotkit/runtime`, `@copilotkit/react-core`, `@copilotkit/react-native`,
  `@copilotkit/a2ui-renderer`, `@copilotkit/aimock` (direct), plus `@copilotkit/channels-{core,slack,teams,intelligence,ui}`
  (transitive via `@copilotkit/runtime`; no first-party manifest declares them).
- **AG-UI protocol** — `@ag-ui/core`, `@ag-ui/client` (https://github.com/ag-ui-protocol/ag-ui).
- **Parallel Search MCP** — public-web research (https://search.parallel.ai/mcp).
- **Composio** — brokered app integrations (https://composio.dev).

Each service sends data to its own provider when used; see the product's privacy documentation
for the data-flow disclosure.

---

## 3. Bundled / linked software

- **Playwright / Chromium** — browser automation and the per-Agent browser (Apache-2.0 / BSD-style).
- **PostgreSQL** and **pgvector** — product data store (PostgreSQL License / PostgreSQL License).
- **Expo** and **React Native** — cross-platform UI (MIT).
- **Tauri** — desktop shell (MIT / Apache-2.0).
- **Bun** — runtime and package manager (MIT).
- Plus all transitive dependencies installed via `bun.lock`; their licenses accompany the
  installed packages and are enumerated by the dependency license audit.

---

## 4. Fonts (SIL Open Font License 1.1)

- **Montserrat** — wordmark / headlines. https://github.com/google/fonts/tree/main/ofl/montserrat
- **Inter** — product UI / body. https://github.com/google/fonts/tree/main/ofl/inter

Both typefaces are distributed under the **SIL Open Font License, Version 1.1**. The license
text follows.

### SIL Open Font License, Version 1.1

```
Copyright (c) 2003 by Bitstream, Inc. / the respective font authors. All Rights Reserved.
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide development of
collaborative font projects, to support the font creation efforts of academic and linguistic
communities, and to provide a free and open framework in which fonts may be shared and
improved in partnership with others.

The OFL allows the licensed fonts to be used, studied, modified and redistributed freely as
long as they are not sold by themselves. The fonts, including any derivative works, can be
bundled, embedded, redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives, however, cannot be released
under any other type of license. The requirement for fonts to remain under this license does
not apply to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright Holder(s) under this
license and clearly marked as such. This may include source files, build scripts and
documentation.

"Reserved Font Name" refers to any names specified as such after the copyright statement(s).

"Original Version" refers to the collection of Font Software components as distributed by the
Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting, or substituting - in
part or in whole - any of the components of the Original Version, by changing formats or by
porting the Font Software to a new environment.

"Author" refers to any designer, engineer, programmer, technical writer or other person who
contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining a copy of the Font
Software, to use, study, copy, merge, embed, modify, redistribute, and sell modified and
unmodified copies of the Font Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components, in Original or Modified
Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled, redistributed and/or
sold with any software, provided that each copy contains the above copyright notice and this
license. These can be included either as stand-alone text files, human-readable headers or in
the appropriate machine-readable metadata fields within text or binary files as long as those
fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font Name(s) unless explicit
written permission is granted by the corresponding Copyright Holder. This restriction only
applies to the primary font name as presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font Software shall not be
used to promote, endorse or advertise any Modified Version, except to acknowledge the
contribution(s) of the Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole, must be distributed
entirely under this license, and must not be distributed under any other license. The
requirement for fonts to remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
PURPOSE AND NONINFRINGEMENT OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL
THE COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, INCLUDING ANY
GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF THE USE OR INABILITY TO USE THE FONT
SOFTWARE OR FROM OTHER DEALINGS IN THE FONT SOFTWARE.
```

---

## 5. Direct dependency license inventory

This section is the dependency license audit required by the product plan
(PLAN.md §10.D.31). It enumerates the direct, first-party-shipped dependencies
behind the §3 summary. Convention follows §3: attributions with the license
name — no new full texts are needed because every direct dependency is
permissively licensed (MIT / Apache-2.0 / ISC / Unlicense / OFL-1.1, or
dual-licensed with a permissive option); the MIT and OFL full texts already
appear in §1 and §4.

Method: each npm license below is the `license` field from the package's
published metadata, read from the installed `node_modules` store backing
`bun.lock` (or from the public npm registry for the `mobile/` set, which is
declared but not part of the bun workspace install). Each Rust crate license
is the `license` field from crates.io metadata. A full transitive scan of the
installed store (1,590 packages) found no GPL/AGPL/LGPL-only packages; the
copyleft-adjacent transitive cases are recorded under §5.7 with their
permissive option or build-time-only status. All transitive licenses accompany
their installed packages per §3.

### 5.1 Web app (`app/`)

- **React / React DOM** 19 (MIT).
- **AG-UI** — `@ag-ui/core` (MIT).
- **CopilotKit** — `@copilotkit/react-core`, `@copilotkit/a2ui-renderer` (MIT).
- **TanStack** — Router, Query, Form, Hotkeys (MIT).
- **Auth** — `better-auth`, `@better-auth/sso` (MIT).
- **UI** — `@base-ui/react`, `@shadcn/react`, `shadcn`,
  `@tabler/icons-react`, `boring-avatars`, `embla-carousel-react`, `motion`,
  `react-use-measure`, `clsx`, `tailwind-merge`, `tw-animate-css` (MIT);
  `class-variance-authority` (Apache-2.0).
- **Content** — `streamdown` (Apache-2.0); `prompt-area` (MIT).
- **Fonts** — `@fontsource-variable/inter` (OFL-1.1; covered by the §4 license text).
- **Validation** — `zod` (MIT).

### 5.2 Server (`server/`)

- **HTTP** — `hono` (MIT).
- **AG-UI** — `@ag-ui/client`, `@ag-ui/core` (MIT); `@ag-ui/mastra` (Apache-2.0).
- **CopilotKit runtime** — `@copilotkit/runtime` (MIT).
- **Mastra** — `@mastra/core`, `@mastra/client-js` (Apache-2.0).
- **Auth** — `better-auth` and `@better-auth/*` adapters (`drizzle-adapter`,
  `electron`, `expo`, `scim`, `sso`) (MIT).
- **Integrations** — `@modelcontextprotocol/sdk`, `twilio` (MIT);
  `@composio/core` (ISC).
- **Data** — `drizzle-orm` (Apache-2.0); `postgres` driver (Unlicense).
- **Policy / scheduling** — `cel-js`, `cron-parser` (MIT).
- **Infra** — `@opentelemetry/*` (`api-logs`, `exporter-logs-otlp-http`,
  `resources`, `sdk-logs`), `rxjs` (Apache-2.0); `eventsource`, `zod` (MIT);
  `yaml` (ISC).

### 5.3 Mobile / Expo app (`mobile/`)

- **Expo** — `expo`, `expo-constants`, `expo-crypto`, `expo-dev-client`,
  `expo-device`, `expo-linking`, `expo-network`, `expo-notifications`,
  `expo-router`, `expo-secure-store`, `expo-web-browser` (MIT).
- **React Native** — `react-native`, `react-native-screens`,
  `react-native-safe-area-context` (MIT); `react`, `react-dom` (MIT).
- **Auth** — `better-auth`, `@better-auth/core`, `@better-auth/expo`,
  `@better-auth/sso`, `@better-fetch/fetch` (MIT).

### 5.4 Root runtime (`package.json`)

- **Playwright** — `playwright-core` (Apache-2.0; §3).

### 5.5 Desktop (`desktop/src-tauri/`, Rust)

- **Tauri** — `tauri`, `tauri-build`, `tauri-plugin-shell`,
  `tauri-plugin-opener`, `tauri-plugin-dialog`,
  `tauri-plugin-single-instance` (Apache-2.0 OR MIT).
- **Utilities** — `serde`, `serde_json`, `rand`, `base64`, `reqwest`, `flate2`,
  `sha2`, `tar`, `libc` (Apache-2.0 OR MIT); `zip`, `portable-pty` (MIT).

### 5.6 Transitive copyleft-adjacent packages (verified)

- **None under strong copyleft.** No GPL/AGPL/LGPL-only packages in the
  installed tree.
- **node-forge** (BSD-3-Clause OR GPL-2.0) — the permissive BSD option applies;
  required by `@expo/cli` (build tooling, not shipped).
- **dompurify** (MPL-2.0 OR Apache-2.0) — the permissive Apache option applies;
  required by `mermaid` (diagram rendering).
- **lightningcss** and its platform binaries (MPL-2.0) — file-level weak
  copyleft; build-time CSS compiler only (via tailwindcss / Vite / Metro), not
  distributed with the product and not affecting compiled output.
- Also present transitively under permissive terms: BlueOak-1.0.0 utilities
  (`glob`, `lru-cache`, …), `caniuse-lite` data (CC-BY-4.0), `argparse`
  (Python-2.0). Their notices accompany the installed packages per §3.

### Scope notes

- `worker/` declares no dependencies.
- Dev-only tooling that never ships is excluded, matching this file's scope:
  TypeScript, Biome, Vite and its plugins, the Tailwind compiler, test
  libraries, `drizzle-kit`, `@copilotkit/aimock`, Expo CLI / EAS build tooling,
  `@tauri-apps/cli`.
- Out of this audit's scope (not in the bun workspace install): `supervisor/`,
  `desktop/` npm (`@tauri-apps/api`), and `agent-*` / `examples/` manifests.

---

Copyright (c) 2026 Opraiz Technology Pvt Ltd. All rights reserved.
Developer: Narein Rao.
