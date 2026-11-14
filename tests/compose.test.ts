import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function composeFile() {
  return readFileSync(
    join(import.meta.dir, "..", "deploy", "compose", "docker-compose.yml"),
    "utf8",
  );
}

function rootDockerfile() {
  return readFileSync(join(import.meta.dir, "..", "Dockerfile"), "utf8");
}

function agentComputerDockerfile() {
  return readFileSync(
    join(import.meta.dir, "..", "agent-orbo-computer", "Dockerfile"),
    "utf8",
  );
}

function runLangGraphAguiModelProbe(
  openaiBaseUrl: string | undefined,
  options: {
    botProvider?: string;
    botModel?: string;
    openaiApiKey?: string;
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "orbo-langgraph-agui-"));
  try {
    writeFileSync(
      join(dir, "ag_ui_langgraph.py"),
      [
        "class LangGraphAgent:",
        "    def __init__(self, **kwargs):",
        "        pass",
        "",
        "def add_langgraph_fastapi_endpoint(**kwargs):",
        "    pass",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "probe.py"),
      [
        "import json",
        "import os",
        "import sys",
        "from types import ModuleType",
        "from ag_ui_langgraph import LangGraphAgent",
        // This probe tests provider configuration without framework dependencies.
        // Real tool execution is covered by the Python protocol regressions.
        "tools = ModuleType('src.tool_runtime')",
        "tools.ToolAwareAgent = LangGraphAgent",
        "tools.bind_tools = tools.execute_tools = tools.next_step = lambda *args: None",
        "tools.model_messages = lambda messages: messages",
        "sys.modules['src.tool_runtime'] = tools",
        "from src import main",
        "chosen = main._model()",
        "print(json.dumps({'base_url': os.environ.get('OPENAI_BASE_URL'), **chosen}))",
        "",
      ].join("\n"),
    );
    mkdirSync(join(dir, "langchain"), { recursive: true });
    writeFileSync(
      join(dir, "langchain", "chat_models.py"),
      [
        "def init_chat_model(model, *, model_provider=None):",
        "    return {'model': model, 'model_provider': model_provider}",
        "",
      ].join("\n"),
    );
    writeFileSync(join(dir, "langchain", "__init__.py"), "");
    mkdirSync(join(dir, "fastapi"), { recursive: true });
    writeFileSync(
      join(dir, "fastapi", "__init__.py"),
      [
        "class FastAPI:",
        "    def middleware(self, *_args, **_kwargs):",
        "        def decorator(fn):",
        "            return fn",
        "        return decorator",
        "    def get(self, *_args, **_kwargs):",
        "        def decorator(fn):",
        "            return fn",
        "        return decorator",
        "",
        "class Request:",
        "    pass",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "fastapi", "responses.py"),
      [
        "class JSONResponse:",
        "    def __init__(self, *args, **kwargs):",
        "        self.args = args",
        "        self.kwargs = kwargs",
        "",
      ].join("\n"),
    );
    mkdirSync(join(dir, "langgraph", "checkpoint"), { recursive: true });
    writeFileSync(
      join(dir, "langgraph", "graph.py"),
      [
        "START = 'start'",
        "END = 'end'",
        "MessagesState = dict",
        "class StateGraph:",
        "    def __init__(self, *_args, **_kwargs):",
        "        pass",
        "    def add_node(self, *_args, **_kwargs):",
        "        pass",
        "    def add_edge(self, *_args, **_kwargs):",
        "        pass",
        "    def add_conditional_edges(self, *_args, **_kwargs):",
        "        pass",
        "    def compile(self, **_kwargs):",
        "        return object()",
        "",
      ].join("\n"),
    );
    writeFileSync(join(dir, "langgraph", "__init__.py"), "");
    writeFileSync(join(dir, "langgraph", "checkpoint", "__init__.py"), "");
    writeFileSync(
      join(dir, "langgraph", "checkpoint", "memory.py"),
      ["class MemorySaver:", "    pass", ""].join("\n"),
    );

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BOT_MODEL: options.botModel ?? "gpt-test",
      OPENAI_API_KEY: options.openaiApiKey ?? "sk-test",
      // src/main runs its boot token guard at import; a real container always has this set,
      // and without it the probe dies before _model() is ever reached.
      ORBO_MANAGED_AGENT_TOKEN: "orbo-test-agent-token",
      // The platform's own path separator: Python splits PYTHONPATH on `;` on Windows, where a
      // `:`-joined list is one unreadable path and the probe dies on a missing `src`.
      PYTHONPATH: [
        dir,
        join(import.meta.dir, "..", "agent-orbo-langgraph-agui"),
      ].join(process.platform === "win32" ? ";" : ":"),
    };
    delete env.CHATGPT_AUTH_FILE;
    if (options.botProvider !== undefined) {
      env.BOT_PROVIDER = options.botProvider;
    } else {
      delete env.BOT_PROVIDER;
    }
    if (openaiBaseUrl === undefined) {
      delete env.OPENAI_BASE_URL;
    } else {
      env.OPENAI_BASE_URL = openaiBaseUrl;
    }
    const result: {
      base_url: string | null;
      model: string;
      model_provider: string | null;
    } = JSON.parse(
      execFileSync("python3", [join(dir, "probe.py")], {
        env,
        encoding: "utf8",
      }),
    );
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// An empty file standing in for the "no `.env` at all" the old `/dev/null` argument meant. A real
// file rather than `/dev/null` because Docker Desktop's `docker.exe` is an MSYS shim that rewrites
// that path to `C:\dev\null` before compose ever sees it, and compose then refuses an env file that
// does not exist. Content is what matters and empty is the same answer on every platform.
const nullEnvDirectory = mkdtempSync(join(tmpdir(), "orbo-compose-env-"));
const nullEnvFile = join(nullEnvDirectory, "empty.env");
writeFileSync(nullEnvFile, "");
afterAll(() => {
  rmSync(nullEnvDirectory, { recursive: true, force: true });
});

/**
 * The environment every `config` invocation runs under: isolated from the host's, and carrying the
 * two tokens the compose file makes required.
 *
 * The tokens are required so a stock `docker compose up` cannot start a stack on well-known
 * development secrets — every real caller (`scripts/start.sh`, `scripts/install.sh`) exports values
 * before handing compose anything, and these tests do the same with throwaways, which is the only
 * way `config` resolves the same file those runs see.
 *
 * The Windows line is for Docker Desktop's `docker.exe`, an MSYS shim that locates its own compose
 * plugin through `ProgramFiles`; with a PATH-only environment it reports every flag as unknown.
 * Linux and macOS runners need nothing, and a stray `ProgramFiles` there would mean nothing either.
 */
function composeEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    PICKED_HARNESS_IMAGE: "orbo-langgraph-agui:test",
    ORBO_COMPUTER_TOKEN: "orbo-test-computer-token",
    SUPERVISOR_TOKEN: "orbo-test-supervisor-token",
    ...(process.platform === "win32"
      ? { ProgramFiles: process.env.ProgramFiles }
      : {}),
    ...overrides,
  };
}

function runComposeConfig(env: Record<string, string>) {
  const output = execFileSync(
    "docker",
    [
      "compose",
      "-f",
      join("deploy", "compose", "docker-compose.yml"),
      "--env-file",
      nullEnvFile,
      "--profile",
      "harness",
      "config",
      "--format",
      "json",
    ],
    {
      cwd: join(import.meta.dir, ".."),
      env: composeEnv(env),
      encoding: "utf8",
    },
  );
  return JSON.parse(output) as {
    services: Record<
      string,
      {
        environment: Record<string, string>;
        extra_hosts?: string[];
        volumes?: Array<{ type: string; source: string; target: string }>;
      }
    >;
  };
}

// `docker compose config` pays a one-off cold start on the first call in a process — the Compose
// plugin initialising and resolving every image reference — which is several seconds on a loaded CI
// runner and a fraction of that once warm. A test that happened to be the first to call it was
// eating that cost inside its own 5s timeout and flaking, while every later test ran in well under a
// second. Absorb the cold start once here, under a timeout that has room for it, so no individual
// test carries it.
beforeAll(() => {
  runComposeConfig({});
}, 60_000);

/**
 * The two tokens are required, and required on purpose — this is the security fix's own criterion.
 *
 * `composeEnv` gives every `config` call throwaway values, exactly as `scripts/start.sh` and
 * `scripts/install.sh` do. What it must not do is make the requirement vanish: a bare `docker
 * compose up` by an operator who has copied `.env.example` and filled nothing in has to fail at the
 * prompt rather than start a stack whose browser and supervisor answer `orbo-dev-*-token`.
 *
 * Each token withheld with the other present, because interpolation stops at the first `:?` it
 * cannot satisfy — withholding both proves only the first, and says nothing about the second.
 */
test("refuses to configure while either dev token is absent", () => {
  for (const withheld of ["ORBO_COMPUTER_TOKEN", "SUPERVISOR_TOKEN"] as const) {
    const env = composeEnv();
    delete env[withheld];
    const result = spawnSync(
      "docker",
      [
        "compose",
        "-f",
        join("deploy", "compose", "docker-compose.yml"),
        "--env-file",
        nullEnvFile,
        "--profile",
        "harness",
        "config",
      ],
      {
        cwd: join(import.meta.dir, ".."),
        env,
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${withheld} is required`);
  }
});

test("provides PostgreSQL with pgvector for local development", () => {
  const compose = composeFile();

  expect(compose).toContain("postgres:");
  expect(compose).toContain("pgvector/pgvector:");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal `${...}` is the fixture — this asserts on unexpanded placeholder text, so a real template would break the test.
  expect(compose).toContain("${POSTGRES_PORT:-5432}:5432");
});

/**
 * Every published port is settable, and defaults to the number the documentation gives.
 *
 * `scripts/start.sh` reads these same names to decide where to look for each service.
 */
test("publishes every service on a settable port with the documented default", () => {
  const compose = composeFile();

  const published = [
    ["POSTGRES_PORT", "5432", "5432"],
    ["ORBO_COMPUTER_PORT", "4100", "4100"],
    ["SUPERVISOR_PORT", "4500", "4300"],
    ["BOT_PORT", "4200", "4200"],
    ["LANGGRAPH_PORT", "4201", "4201"],
  ] as const;

  for (const [name, host, container] of published) {
    expect(compose).toContain(`\${${name}:-${host}}:${container}`);
  }
});

/**
 * The services that answer to a secret are published to the host's loopback and no further.
 *
 * A published port with no interface in front of it binds every address the host has, so the
 * service answers anything that can route to the machine. That is the wrong default for all of
 * these and worst for the supervisor, which holds the Docker socket: reaching it is root on the
 * host by way of four verbs, and `SUPERVISOR_TOKEN` is a shared secret rather than a network
 * boundary. The computer says the same thing about itself in a comment beside its own port, and
 * this is that reasoning applied to every service that has one.
 *
 * Named ports rather than a blanket rule, so adding a service is a decision about where it should
 * answer rather than something this test quietly grants.
 */
test("publishes every service that holds a secret on loopback only", () => {
  const compose = composeFile();

  for (const name of [
    "POSTGRES_PORT",
    "SUPERVISOR_PORT",
    "ORBO_COMPUTER_PORT",
    "BOT_PORT",
    "LANGGRAPH_PORT",
    "PICKED_HARNESS_PORT",
  ]) {
    const published = [
      ...compose.matchAll(
        new RegExp(`^\\s*- "([^"\\n]*)\\$\\{${name}:-\\d+\\}:[^"\\n]+"`, "gm"),
      ),
    ];
    expect(published.length).toBeGreaterThan(0);
    for (const mapping of published) {
      expect(["127.0.0.1:", "[::1]:"]).toContain(mapping[1]);
    }
  }
});

/**
 * The host reads OPENAI_BASE_URL directly; containers can need a different route to that model.
 * Exercise Compose's nested interpolation so all shipped Bots and the picked harness receive the
 * override when present and keep the host fallback when it is absent or explicitly cleared.
 */
const compatibleEndpointCases: Array<{
  name: string;
  environment: Record<string, string>;
  expected: string;
}> = [
  {
    name: "uses the container override ahead of the host endpoint",
    environment: {
      OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
      OPENAI_CONTAINER_BASE_URL: "http://model-service:11434/v1",
    },
    expected: "http://model-service:11434/v1",
  },
  {
    name: "uses the host endpoint when the container override is unset",
    environment: { OPENAI_BASE_URL: "https://models.example/v1" },
    expected: "https://models.example/v1",
  },
  {
    name: "uses the host endpoint when the container override is cleared",
    environment: {
      OPENAI_BASE_URL: "https://models.example/v1",
      OPENAI_CONTAINER_BASE_URL: "",
    },
    expected: "https://models.example/v1",
  },
  {
    name: "leaves the endpoint empty when neither route is configured",
    environment: {},
    expected: "",
  },
];

for (const { name, environment, expected } of compatibleEndpointCases) {
  test(`every Bot ${name}`, () => {
    const config = runComposeConfig({
      OPENAI_API_KEY: "synthetic-openai-key",
      ...environment,
    });
    for (const service of ["orbo-bot", "orbo-langgraph", "orbo-harness"]) {
      expect(config.services[service].environment.OPENAI_BASE_URL).toBe(
        expected,
      );
    }
  });
}

test("passes every other provider's key and endpoint into the framework Bot and the picked harness", () => {
  const config = runComposeConfig({
    ANTHROPIC_API_KEY: "sk-ant-synthetic",
    ANTHROPIC_BASE_URL: "https://anthropic-gateway.example",
    GOOGLE_API_KEY: "synthetic-google",
    GOOGLE_GENERATIVE_AI_BASE_URL: "https://generativelanguage.example/v1beta",
  });

  // A service either receives the variable or it does not; reading the file's text cannot tell
  // the difference, because any one service declaring it would satisfy a raw `toContain`.
  for (const service of ["orbo-langgraph", "orbo-harness"]) {
    expect(config.services[service].environment).toMatchObject({
      ANTHROPIC_API_KEY: "sk-ant-synthetic",
      ANTHROPIC_BASE_URL: "https://anthropic-gateway.example",
      GOOGLE_API_KEY: "synthetic-google",
      GOOGLE_GENERATIVE_AI_BASE_URL:
        "https://generativelanguage.example/v1beta",
    });
  }
});

test("normalizes the picked LangGraph harness's blank OpenAI endpoint before model construction", () => {
  expect(runLangGraphAguiModelProbe("").base_url).toBeNull();
  expect(runLangGraphAguiModelProbe("   ").base_url).toBeNull();
  expect(runLangGraphAguiModelProbe("http://127.0.0.1:4310/v1").base_url).toBe(
    "http://127.0.0.1:4310/v1",
  );
});

test("passes the selected Anthropic provider and model into the picked harness", () => {
  const config = runComposeConfig({
    ANTHROPIC_API_KEY: "sk-ant-synthetic",
    ANTHROPIC_BASE_URL: "https://anthropic-gateway.example",
    BOT_PROVIDER: "anthropic",
    BOT_MODEL: "claude-sonnet-4-5",
    OPENAI_API_KEY: "",
  });

  expect(config.services["orbo-harness"].environment).toMatchObject({
    ANTHROPIC_API_KEY: "sk-ant-synthetic",
    ANTHROPIC_BASE_URL: "https://anthropic-gateway.example",
    BOT_PROVIDER: "anthropic",
    BOT_MODEL: "claude-sonnet-4-5",
    OPENAI_API_KEY: "",
  });

  expect(
    runLangGraphAguiModelProbe(undefined, {
      botProvider: "anthropic",
      botModel: "claude-sonnet-4-5",
      openaiApiKey: "",
    }),
  ).toMatchObject({
    model: "claude-sonnet-4-5",
    model_provider: "anthropic",
  });

  const openaiConfig = runComposeConfig({
    OPENAI_API_KEY: "sk-openai-synthetic",
    OPENAI_BASE_URL: "https://openai-compatible.example/v1",
  });
  expect(openaiConfig.services["orbo-harness"].environment).toMatchObject({
    OPENAI_API_KEY: "sk-openai-synthetic",
    OPENAI_BASE_URL: "https://openai-compatible.example/v1",
    BOT_PROVIDER: "openai",
    BOT_MODEL: "gpt-5.5",
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_BASE_URL: "",
  });
});

test("mounts the ChatGPT token store directory into the picked harness", () => {
  const config = runComposeConfig({
    CHATGPT_AUTH_FILE: "/root/.langchain/chatgpt-auth.json",
  });

  expect(config.services["orbo-harness"].environment).toMatchObject({
    CHATGPT_AUTH_FILE: "/root/.langchain/chatgpt-auth.json",
  });
  expect(config.services["orbo-harness"].volumes).toContainEqual(
    expect.objectContaining({
      type: "bind",
      target: "/root/.langchain",
    }),
  );
  expect(config.services["orbo-harness"].volumes).not.toContainEqual(
    expect.objectContaining({
      type: "bind",
      target: "/root/.langchain/chatgpt-auth.json",
    }),
  );
});

test("enables pgvector before creating vector columns", () => {
  const migration = readFileSync(
    join(import.meta.dir, "..", "server", "drizzle", "0000_schema.sql"),
    "utf8",
  );

  // The order is the property, not the first line. A `vector` column cannot be created before the
  // extension that defines the type, and a generated migration has no reason to put them in that
  // order on its own.
  const extension = migration.indexOf("CREATE EXTENSION IF NOT EXISTS vector;");
  const firstVectorColumn = migration.search(/"embedding" vector\(/);
  expect(extension).toBeGreaterThanOrEqual(0);
  expect(firstVectorColumn).toBeGreaterThan(extension);
});

test("runs migrations after PostgreSQL becomes healthy", () => {
  const compose = composeFile();

  expect(compose).toContain("migrate:");
  expect(compose).toContain("condition: service_healthy");
  expect(compose).toContain('"drizzle-kit", "migrate"');
});

test("builds the deployment image with Playwright's Chromium payload only", () => {
  for (const dockerfile of [rootDockerfile(), agentComputerDockerfile()]) {
    expect(dockerfile).toContain(
      "FROM node:24.18.1-bookworm-slim AS node-toolchain",
    );
    expect(dockerfile).toContain("FROM ubuntu:24.04");
    expect(dockerfile).not.toContain("mcr.microsoft.com/playwright");
    expect(dockerfile).toContain("ARG PLAYWRIGHT_VERSION=1.62.1");
    expect(dockerfile).toContain("ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright");
    expect(dockerfile).toContain(
      "COPY --from=node-toolchain /usr/local /usr/local",
    );
    expect(dockerfile).toContain(
      'bunx --bun "playwright@' +
        "$" +
        "{PLAYWRIGHT_VERSION}" +
        '" install --with-deps chromium',
    );
    expect(dockerfile).not.toMatch(/\bnodejs\b|\bnpm\b/);
    expect(dockerfile).not.toMatch(
      /\binstall(?:\s+--with-deps)?\s+(firefox|webkit)\b/,
    );
  }

  const compose = composeFile();
  // `../..` because the compose file lives under deploy/compose/ and reaches the repository root
  // from there; it said `.` when the file sat at the root, and the assertion was not moved with it.
  expect(compose).toContain(
    [
      "orbo-computer:",
      "    build:",
      "      context: ../..",
      "      dockerfile: agent-orbo-computer/Dockerfile",
    ].join("\n"),
  );
});

test("takes Bun from the same immutable release in both computer images", () => {
  const { packageManager } = JSON.parse(
    readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
  );
  const bunVersion = packageManager.replace("bun@", "");
  const sources = [];
  for (const dockerfile of [rootDockerfile(), agentComputerDockerfile()]) {
    const source = dockerfile.match(
      /^FROM (oven\/bun:\S+) AS bun-toolchain$/m,
    )?.[1];
    expect(source).toMatch(
      new RegExp(
        `^oven/bun:${bunVersion.replaceAll(".", "\\.")}@sha256:[a-f0-9]{64}$`,
      ),
    );
    expect(dockerfile).toContain(
      "COPY --from=bun-toolchain /usr/local/bin/bun /usr/local/bin/bun",
    );
    expect(dockerfile).not.toContain("bun.sh/install");
    expect(dockerfile).not.toMatch(/\b(?:curl|wget)\b[^\n]*\|\s*(?:bash|sh)\b/);
    sources.push(source);
  }
  expect(sources[0]).toBe(sources[1]);
});

/**
 * Per-Bot egress reaches the processes that read it.
 *
 * `EGRESS_PROXY_<BOT>` and `EGRESS_PROXY_DEFAULT` are resolved from `process.env` by the computer
 * itself (`agent-orbo-computer/src/egress.ts`), and the supervisor forwards every `EGRESS_PROXY` key out
 * of its own environment into each computer it creates (`supervisor/src/index.ts`). Compose gives a
 * container only what its `environment:` and `env_file:` blocks name, and for a long time neither
 * named these, so an operator who configured a proxy per the documentation got a browser that went
 * out directly and no error saying so.
 *
 * A file rather than `environment:` entries because the names are per-Bot and therefore not knowable
 * here, and a file of its own rather than `.env` because that one holds the deployment's secrets and
 * the browser container is deliberately not given them.
 */
test("carries per-Bot egress into the computer and the supervisor", () => {
  const compose = composeFile();

  // Both halves: the shared computer reads them itself, and the supervisor passes them on.
  const services = compose.split(/^ {2}(?=\S)/m);
  for (const name of ["orbo-computer:", "supervisor:"]) {
    const service = services.find((block) => block.startsWith(name));
    expect(service).toBeDefined();
    expect(service).toContain("egress.env");
  }

  // Optional, because a deployment with no proxy is the ordinary case and must still start.
  expect(compose).toContain("required: false");
});

/**
 * The computer runs as the browser's user, in every place a container is started.
 *
 * Three places can start a computer: this file's shared `orbo-computer` service, and the
 * supervisor's `docker.createContainer` for each per-Bot one, and the image's own `USER` for
 * whoever runs it by hand. All three say the same pinned number, because the boundary a
 * `--no-sandbox` Chromium has is its process user, and a browser holding real logins run as root
 * is the one arrangement none of this is allowed to drift back into.
 */
test("runs the computer as the pinned browser user everywhere it starts", () => {
  const compose = composeFile();

  // The shared service: user on the container, and the image that carries the same contract.
  const service = compose
    .split(/^ {2}(?=\S)/m)
    .find((block) => block.startsWith("orbo-computer:"));
  // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the compose file's literal expansion syntax, not interpolating.
  expect(service).toContain("user: ${ORBO_COMPUTER_USER:-1001:1001}");

  const supervisorDocker = readFileSync(
    join(import.meta.dir, "..", "supervisor", "src", "docker.ts"),
    "utf8",
  );
  // The per-Bot containers, created by the supervisor, carry the same default.
  expect(supervisorDocker).toContain('options.user ?? "1001:1001"');

  // The image agrees, at the number the contract pins.
  const dockerfile = agentComputerDockerfile();
  expect(dockerfile).toContain(
    "useradd --uid 1001 --create-home --shell /bin/bash pwuser",
  );
  expect(dockerfile).toContain("USER pwuser");
  // The directories a non-root browser writes are owned before it runs.
  expect(dockerfile).toContain(
    "chown -R pwuser:pwuser /workspace /profiles /app",
  );
});

test("gives the selected harness the same governed callback as the framework Bot", () => {
  const config = runComposeConfig({
    ORBO_TOOL_URL: "http://callback.example/api/agent-tools/call",
    ORBO_AGENT_TOOL_TOKEN: "synthetic-callback-token",
  });
  for (const service of ["orbo-harness", "orbo-langgraph"] as const) {
    expect(config.services[service].environment).toMatchObject({
      ORBO_TOOL_URL: "http://callback.example/api/agent-tools/call",
      ORBO_AGENT_TOOL_TOKEN: "synthetic-callback-token",
    });
    expect(config.services[service].extra_hosts).toContain(
      "host.docker.internal=host-gateway",
    );
  }
});
