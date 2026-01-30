import type { Tool } from "../types.js";

export const WEB_SEARCH_TOOL_NAME = "web_search";
export const WEB_SEARCH_TOOL_DESCRIPTION = "Enable server-side web search for supported models.";

type ToolSchema = {
	properties?: Record<string, unknown>;
} | null;

export function isWebSearchTool(tool: Tool): boolean {
	if (tool.name !== WEB_SEARCH_TOOL_NAME) return false;
	if (tool.description !== WEB_SEARCH_TOOL_DESCRIPTION) return false;
	const schema = tool.parameters as ToolSchema;
	const properties = schema?.properties;
	if (!properties) return true;
	return Object.keys(properties).length === 0;
}

export function hasWebSearchTool(tools: Tool[] | undefined): boolean {
	if (!tools) return false;
	return tools.some(isWebSearchTool);
}
