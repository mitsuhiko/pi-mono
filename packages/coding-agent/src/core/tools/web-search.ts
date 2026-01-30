import type { AgentTool } from "@mariozechner/pi-agent-core";
import { WEB_SEARCH_TOOL_DESCRIPTION, WEB_SEARCH_TOOL_NAME } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

const webSearchSchema = Type.Object({}, { additionalProperties: false });

export function createWebSearchTool(): AgentTool<typeof webSearchSchema> {
	return {
		name: WEB_SEARCH_TOOL_NAME,
		label: WEB_SEARCH_TOOL_NAME,
		description: WEB_SEARCH_TOOL_DESCRIPTION,
		parameters: webSearchSchema,
		execute: async () => {
			throw new Error("Web search is handled by the model provider and cannot be executed locally.");
		},
	};
}

export const webSearchTool = createWebSearchTool();
