import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.js";

const mocks = vi.hoisted(() => ({
	state: {
		hookSessionDir: undefined as string | undefined,
		capturedSessionDir: undefined as string | undefined,
	},
	createAgentSession: vi.fn(async (options: { sessionManager?: { getSessionDir(): string } }) => {
		mocks.state.capturedSessionDir = options.sessionManager?.getSessionDir();
		return {
			session: {
				model: { id: "test-model", provider: "test", reasoning: false },
				thinkingLevel: "off",
				setThinkingLevel: vi.fn(),
			},
			modelFallbackMessage: undefined,
		};
	}),
	runPrintMode: vi.fn(async () => 0),
	selectSession: vi.fn(),
}));

vi.mock("../src/core/sdk.js", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		createAgentSession: mocks.createAgentSession,
	};
});

vi.mock("../src/modes/index.js", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		runPrintMode: mocks.runPrintMode,
	};
});

vi.mock("../src/cli/session-picker.js", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		selectSession: mocks.selectSession,
	};
});

vi.mock("../src/core/resource-loader.js", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		DefaultResourceLoader: class {
			async reload(): Promise<void> {}

			getExtensions() {
				const handlers = new Map();
				if (mocks.state.hookSessionDir) {
					handlers.set("session_directory", [async () => ({ sessionDir: mocks.state.hookSessionDir })]);
				}
				return {
					extensions: [{ path: "/mock-extension.ts", handlers, flags: new Map() }],
					errors: [],
					runtime: {
						pendingProviderRegistrations: [],
						flagValues: new Map(),
					},
				};
			}
		},
	};
});

describe("sessionDir precedence", () => {
	let tempDir: string;
	let agentDir: string;
	let projectDir: string;
	let originalCwd: string;
	let originalAgentDir: string | undefined;
	let originalExitCode: typeof process.exitCode;
	let originalIsTTY: boolean | undefined;

	beforeEach(() => {
		vi.resetModules();
		mocks.state.hookSessionDir = "./hook-sessions";
		mocks.state.capturedSessionDir = undefined;
		mocks.createAgentSession.mockClear();
		mocks.runPrintMode.mockClear();
		mocks.selectSession.mockReset();

		tempDir = join(tmpdir(), `pi-session-dir-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		projectDir = join(tempDir, "project");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(join(projectDir, ".pi"), { recursive: true });

		originalCwd = process.cwd();
		originalAgentDir = process.env[ENV_AGENT_DIR];
		originalExitCode = process.exitCode;
		originalIsTTY = process.stdin.isTTY;
		process.exitCode = undefined;
		process.env[ENV_AGENT_DIR] = agentDir;
		process.chdir(projectDir);
		Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
	});

	afterEach(() => {
		process.chdir(originalCwd);
		process.exitCode = originalExitCode;
		Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
		if (originalAgentDir === undefined) {
			delete process.env[ENV_AGENT_DIR];
		} else {
			process.env[ENV_AGENT_DIR] = originalAgentDir;
		}
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("prefers settings sessionDir over the session_directory hook for new sessions", async () => {
		writeFileSync(join(projectDir, ".pi", "settings.json"), JSON.stringify({ sessionDir: "./settings-sessions" }));

		const { main } = await import("../src/main.js");
		await main(["--print", "test prompt"]);

		expect(mocks.state.capturedSessionDir).toBe("./settings-sessions");
		expect(mocks.runPrintMode).toHaveBeenCalledOnce();
	});

	it("prefers CLI --session-dir over settings and the session_directory hook", async () => {
		writeFileSync(join(projectDir, ".pi", "settings.json"), JSON.stringify({ sessionDir: "./settings-sessions" }));

		const { main } = await import("../src/main.js");
		await main(["--print", "--session-dir", "./cli-sessions", "test prompt"]);

		expect(mocks.state.capturedSessionDir).toBe("./cli-sessions");
		expect(mocks.runPrintMode).toHaveBeenCalledOnce();
	});

	it("uses settings sessionDir ahead of the session_directory hook for --resume", async () => {
		writeFileSync(join(projectDir, ".pi", "settings.json"), JSON.stringify({ sessionDir: "./settings-sessions" }));

		const { SessionManager } = await import("../src/core/session-manager.js");
		const listSpy = vi.spyOn(SessionManager, "list");
		mocks.selectSession.mockImplementation(async (listCurrent: (onProgress: () => void) => Promise<unknown>) => {
			await listCurrent(() => {});
			return join(projectDir, "picked-session.jsonl");
		});

		const { main } = await import("../src/main.js");
		await main(["--print", "--resume"]);

		expect(listSpy).toHaveBeenCalledWith(expect.any(String), "./settings-sessions", expect.any(Function));
		expect(mocks.state.capturedSessionDir).toBe("./settings-sessions");
		expect(mocks.runPrintMode).toHaveBeenCalledOnce();
	});
});
