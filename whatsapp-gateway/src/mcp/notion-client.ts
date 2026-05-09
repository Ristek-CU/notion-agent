// src/mcp/notion-client.ts
// MCP client for Notion — now consolidated to use notion-api-core for all operations.
// MCP is kept for compatibility with external MCP tools, but all internal operations
// use the direct API via notion-api-core for consistency, retry, rate limiting, and caching.
// Covers feature: #14 (consolidate MCP vs Direct API)

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { env } from "../config.js";

let mcpClient: Client | null = null;
let mcpConnected = false;

/**
 * Get or create MCP client connection to Notion MCP Server.
 * The Notion MCP Server runs as a child process via stdio transport.
 * Only connects when explicitly needed (lazy initialization).
 */
async function getMcpClient(): Promise<Client | null> {
  if (mcpClient && mcpConnected) return mcpClient;

  try {
    console.log("[MCP] Spawning Notion MCP Server via stdio...");

    const transport = new StdioClientTransport({
      command: "node",
      args: ["/opt/notion-mcp-server/build/index.js"],
      env: {
        OPENAPI_MCP_HEADERS: JSON.stringify({
          Authorization: `Bearer ${env.NOTION_API_KEY}`,
          "Notion-Version": env.NOTION_VERSION,
        }),
      },
    });

    mcpClient = new Client(
      { name: "wa-bot-orchestrator", version: "1.0.0" },
      { capabilities: {} }
    );

    await mcpClient.connect(transport);
    mcpConnected = true;
    console.log("[MCP] Connected to Notion MCP Server");
    return mcpClient;
  } catch (error) {
    console.warn("[MCP] Failed to connect to Notion MCP Server:", error);
    console.warn("[MCP] Falling back to direct API (notion-api-core)");
    mcpConnected = false;
    return null;
  }
}

/**
 * Generic MCP tool call wrapper.
 * Returns null if MCP is unavailable (caller should fall back to direct API).
 */
export async function callNotionMCP(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  const client = await getMcpClient();
  if (!client) {
    console.warn(`[MCP] Cannot call ${toolName} — MCP server unavailable`);
    return null;
  }

  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    return result;
  } catch (error) {
    console.error(`[MCP] Tool call ${toolName} failed:`, error);
    return null;
  }
}

/**
 * List all available tools from the Notion MCP Server.
 */
export async function listMCPTools(): Promise<unknown[] | null> {
  const client = await getMcpClient();
  if (!client) return null;

  try {
    const tools = await client.listTools();
    return tools.tools;
  } catch (error) {
    console.error("[MCP] List tools failed:", error);
    return null;
  }
}

/**
 * Gracefully close the MCP connection
 */
export async function closeMcpClient(): Promise<void> {
  if (mcpClient && mcpConnected) {
    try {
      await mcpClient.close();
    } catch {
      // Ignore close errors
    }
    mcpClient = null;
    mcpConnected = false;
    console.log("[MCP] Connection closed");
  }
}
