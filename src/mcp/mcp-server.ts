#!/usr/bin/env node

/**
 * TripNara MCP Server
 * 
 * Model Context Protocol server for TripNara travel planning system.
 * Exposes TripNara's core functionality through MCP tools.
 */

// Note: Using dynamic import since the package uses ES modules
// This will be compiled by ts-node or tsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

// Initialize Prisma Client
const prisma = new PrismaClient();

// Create the MCP server instance
const server = new McpServer(
  {
    name: 'tripnara-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Helper function to format tool response
function formatResponse(data: any): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

// Register tools
server.registerTool(
  'hello',
  {
    description: 'A simple hello world tool to test the MCP server',
  },
  async () => {
    return formatResponse('Hello from TripNara MCP Server!');
  }
);

server.registerTool(
  'get_server_info',
  {
    description: 'Get information about the TripNara MCP server',
  },
  async () => {
    return formatResponse({
      name: 'TripNara MCP Server',
      version: '1.0.0',
      description: 'Model Context Protocol server for TripNara travel planning system',
      capabilities: ['tools', 'resources', 'prompts'],
    });
  }
);

// Trip-related tools
server.registerTool(
  'list_trips',
  {
    description: 'List all trips in the database',
    inputSchema: {
      limit: z.number().optional().default(10).describe('Maximum number of trips to return (default: 10)'),
    },
  },
  async (args) => {
    try {
      const limit = args?.limit || 10;
      const trips = await prisma.trip.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          TripDay: {
            orderBy: { date: 'asc' },
          },
        },
      });

      const result = trips.map((trip) => ({
        id: trip.id,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        createdAt: trip.createdAt,
        daysCount: trip.TripDay.length,
      }));

      return formatResponse({
        count: result.length,
        trips: result,
      });
    } catch (error: any) {
      return formatResponse({
        error: 'Failed to list trips',
        message: error.message,
      });
    }
  }
);

server.registerTool(
  'get_trip',
  {
    description: 'Get detailed information about a specific trip by ID',
    inputSchema: {
      tripId: z.string().describe('The trip ID to retrieve'),
    },
  },
  async (args) => {
    try {
      if (!args?.tripId) {
        return formatResponse({
          error: 'tripId is required',
        });
      }

      const trip = await prisma.trip.findUnique({
        where: { id: args.tripId },
        include: {
          TripDay: {
            orderBy: { date: 'asc' },
            include: {
              ItineraryItem: {
                include: {
                  Place: true,
                },
              },
            },
          },
        },
      });

      if (!trip) {
        return formatResponse({
          error: 'Trip not found',
          tripId: args.tripId,
        });
      }

      return formatResponse({
        id: trip.id,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        budgetConfig: trip.budgetConfig,
        pacingConfig: trip.pacingConfig,
        metadata: trip.metadata,
        days: trip.TripDay.map((day) => ({
          id: day.id,
          date: day.date,
          itemsCount: day.ItineraryItem.length,
          items: day.ItineraryItem.map((item) => ({
            id: item.id,
            placeId: item.placeId,
            placeName: item.Place?.nameCN || item.Place?.nameEN,
            startTime: item.startTime,
            endTime: item.endTime,
          })),
        })),
      });
    } catch (error: any) {
      return formatResponse({
        error: 'Failed to get trip',
        message: error.message,
      });
    }
  }
);

// Place-related tools
server.registerTool(
  'search_places',
  {
    description: 'Search for places by name or location',
    inputSchema: {
      query: z.string().describe('Search query (name, address, etc.)'),
      category: z.string().optional().describe('Filter by category (RESTAURANT, ATTRACTION, SHOPPING, HOTEL, etc.)'),
      limit: z.number().optional().default(20).describe('Maximum number of results (default: 20)'),
      countryCode: z.string().optional().describe('Filter by country code (ISO 3166-1 alpha-2)'),
    },
  },
  async (args) => {
    try {
      if (!args?.query) {
        return formatResponse({
          error: 'query is required',
        });
      }

      const limit = args?.limit || 20;
      const where: any = {
        OR: [
          { nameCN: { contains: args.query, mode: 'insensitive' } },
          { nameEN: { contains: args.query, mode: 'insensitive' } },
          { address: { contains: args.query, mode: 'insensitive' } },
        ],
      };

      if (args.category) {
        where.category = args.category;
      }

      if (args.countryCode) {
        where.City = {
          countryCode: args.countryCode,
        };
      }

      const places = await prisma.place.findMany({
        where,
        take: limit,
        orderBy: { rating: 'desc' },
        select: {
          id: true,
          nameCN: true,
          nameEN: true,
          category: true,
          address: true,
          rating: true,
          metadata: true,
          City: {
            select: {
              countryCode: true,
            },
          },
        },
      });

      return formatResponse({
        count: places.length,
        places: places.map((p) => ({
          id: p.id,
          nameCN: p.nameCN,
          nameEN: p.nameEN,
          category: p.category,
          address: p.address,
          rating: p.rating,
          countryCode: p.City?.countryCode || null,
        })),
      });
    } catch (error: any) {
      return formatResponse({
        error: 'Failed to search places',
        message: error.message,
      });
    }
  }
);

server.registerTool(
  'get_place',
  {
    description: 'Get detailed information about a specific place by ID',
    inputSchema: {
      placeId: z.number().describe('The place ID to retrieve'),
    },
  },
  async (args) => {
    try {
      if (!args?.placeId) {
        return formatResponse({
          error: 'placeId is required',
        });
      }

      const place = await prisma.place.findUnique({
        where: { id: args.placeId },
        include: {
          City: {
            select: {
              countryCode: true,
            },
          },
        },
      });

      if (!place) {
        return formatResponse({
          error: 'Place not found',
          placeId: args.placeId,
        });
      }

      return formatResponse({
        id: place.id,
        nameCN: place.nameCN,
        nameEN: place.nameEN,
        category: place.category,
        address: place.address,
        rating: place.rating,
        countryCode: place.City?.countryCode || null,
        metadata: place.metadata,
        createdAt: place.createdAt,
        updatedAt: place.updatedAt,
      });
    } catch (error: any) {
      return formatResponse({
        error: 'Failed to get place',
        message: error.message,
      });
    }
  }
);

// Main function to start the server
async function main() {
  try {
    // Connect to database
    await prisma.$connect();
    console.error('Database connected');

    // Start MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    // Log to stderr (stdout is used for JSON-RPC communication)
    console.error('TripNara MCP Server started and ready');
  } catch (error: any) {
    console.error('Failed to start MCP server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('\nShutting down MCP server...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\nShutting down MCP server...');
  await prisma.$disconnect();
  process.exit(0);
});

// Run the server
main().catch(async (error) => {
  console.error('Failed to start MCP server:', error);
  await prisma.$disconnect();
  process.exit(1);
});
