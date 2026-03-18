import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyAccessToken } from "@/lib/crypto";
import { tools, handleTool } from "@/lib/tools";

const WWW_AUTHENTICATE = 'Bearer resource_metadata="/.well-known/oauth-authorization-server"';

async function authenticate(req: Request): Promise<string> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  return verifyAccessToken(auth.slice(7));
}

function createServer(userId: string): McpServer {
  const server = new McpServer(
    { name: "strava-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  for (const tool of tools) {
    server.tool(tool.name, tool.description ?? "", async (args: Record<string, unknown>) => {
      const content = await handleTool(userId, tool.name, args);
      return { content };
    });
  }

  return server;
}

export async function POST(req: Request): Promise<Response> {
  let userId: string;
  try {
    userId = await authenticate(req);
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "WWW-Authenticate": WWW_AUTHENTICATE,
        "Content-Type": "application/json",
      },
    });
  }

  const server = createServer(userId);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
    await transport.close();
  }
}

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ error: "SSE not supported in stateless mode" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}

export async function DELETE(): Promise<Response> {
  return new Response(null, { status: 200 });
}
