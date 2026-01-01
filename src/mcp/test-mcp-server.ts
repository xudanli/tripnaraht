#!/usr/bin/env node

/**
 * Test script for MCP Server
 * Tests the MCP server tools to ensure they work correctly
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function testMcpServer() {
  console.log('Starting MCP Server test...\n');

  // Spawn the MCP server process
  const serverProcess = spawn('npx', ['tsx', 'src/mcp/mcp-server.ts'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Create client transport
  const transport = new StdioClientTransport({
    command: serverProcess.spawnfile,
    args: serverProcess.spawnargs.slice(1),
    env: process.env,
  });

  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    // Connect to server
    await client.connect(transport);
    console.log('✅ Connected to MCP server\n');

    // Test 1: hello tool
    console.log('Test 1: Testing hello tool...');
    const helloResult = await client.callTool({
      name: 'hello',
      arguments: {},
    });
    console.log('✅ hello tool result:', helloResult.content);
    console.log('');

    // Test 2: get_server_info tool
    console.log('Test 2: Testing get_server_info tool...');
    const infoResult = await client.callTool({
      name: 'get_server_info',
      arguments: {},
    });
    console.log('✅ get_server_info result:', infoResult.content);
    console.log('');

    // Test 3: list_trips tool
    console.log('Test 3: Testing list_trips tool...');
    const tripsResult = await client.callTool({
      name: 'list_trips',
      arguments: { limit: 5 },
    });
    console.log('✅ list_trips result:', tripsResult.content);
    console.log('');

    // Test 4: search_places tool
    console.log('Test 4: Testing search_places tool...');
    const placesResult = await client.callTool({
      name: 'search_places',
      arguments: { query: 'test', limit: 3 },
    });
    console.log('✅ search_places result:', placesResult.content);
    console.log('');

    // Test 5: get_trip tool (if we have a trip)
    const tripsData = JSON.parse(tripsResult.content[0].text);
    if (tripsData.trips && tripsData.trips.length > 0) {
      console.log('Test 5: Testing get_trip tool...');
      const tripId = tripsData.trips[0].id;
      const tripResult = await client.callTool({
        name: 'get_trip',
        arguments: { tripId },
      });
      console.log('✅ get_trip result:', tripResult.content[0].text.substring(0, 200) + '...');
      console.log('');
    }

    // Test 6: List available tools
    console.log('Test 6: Listing available tools...');
    const toolsResult = await client.listTools();
    console.log(`✅ Found ${toolsResult.tools.length} tools:`, toolsResult.tools.map(t => t.name).join(', '));
    console.log('');

    console.log('✅ All tests passed!');
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await client.close();
    serverProcess.kill();
  }
}

testMcpServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

