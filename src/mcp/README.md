# TripNara MCP Server

Model Context Protocol (MCP) server for TripNara travel planning system.

## Overview

This MCP server exposes TripNara's core functionality through the Model Context Protocol, allowing AI assistants and other MCP clients to interact with TripNara's travel planning capabilities.

## Installation

The MCP server requires the `@modelcontextprotocol/sdk` package, which is already installed in this project.

## Running the Server

### Using Node.js with ts-node

```bash
npm run mcp:server
```

Or directly:

```bash
node --loader ts-node/esm src/mcp/mcp-server.ts
```

### Using tsx (recommended)

If you have `tsx` installed globally or as a dev dependency:

```bash
npx tsx src/mcp/mcp-server.ts
```

## Configuration

The server communicates via stdio (standard input/output), which is the standard transport for MCP servers. It reads JSON-RPC messages from stdin and writes responses to stdout.

## Current Tools

The server currently provides the following tools:

### Basic Tools
1. **hello** - A simple test tool that returns a greeting message
2. **get_server_info** - Returns information about the MCP server

### Trip Management Tools
3. **list_trips** - List all trips in the database
   - Parameters:
     - `limit` (optional): Maximum number of trips to return (default: 10)
   - Returns: Array of trips with basic information

4. **get_trip** - Get detailed information about a specific trip
   - Parameters:
     - `tripId` (required): The trip ID to retrieve
   - Returns: Detailed trip information including days and itinerary items

### Place Search Tools
5. **search_places** - Search for places by name or location
   - Parameters:
     - `query` (required): Search query (name, address, etc.)
     - `category` (optional): Filter by category (RESTAURANT, ATTRACTION, SHOPPING, HOTEL, etc.)
     - `countryCode` (optional): Filter by country code (ISO 3166-1 alpha-2)
     - `limit` (optional): Maximum number of results (default: 20)
   - Returns: Array of matching places

6. **get_place** - Get detailed information about a specific place
   - Parameters:
     - `placeId` (required): The place ID to retrieve
   - Returns: Detailed place information

## Adding New Tools

To add new tools, use the `server.registerTool()` method:

```typescript
server.registerTool(
  'tool_name',
  {
    description: 'Tool description',
    inputSchema: {
      // Zod schema for input validation
    },
  },
  async (args) => {
    // Tool implementation
    return {
      content: [
        {
          type: 'text',
          text: 'Result',
        },
      ],
    };
  }
);
```

## Integration with Claude Desktop

To use this server with Claude Desktop, add the following to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tripnara": {
      "command": "node",
      "args": [
        "--loader",
        "ts-node/esm",
        "/absolute/path/to/project/src/mcp/mcp-server.ts"
      ]
    }
  }
}
```

Or if using tsx:

```json
{
  "mcpServers": {
    "tripnara": {
      "command": "npx",
      "args": [
        "tsx",
        "/absolute/path/to/project/src/mcp/mcp-server.ts"
      ]
    }
  }
}
```

## Future Enhancements

Potential tools to add:

- Trip creation and management
- Place search and recommendations
- Itinerary optimization
- Travel planning assistance
- Route direction queries
- Country profile information

