"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherMcpClient = void 0;
exports.getWeatherClient = getWeatherClient;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
class WeatherMcpClient {
    constructor() {
        this.client = null;
        this.transport = null;
        this.isConnected = false;
    }
    async connect() {
        if (this.isConnected && this.client) {
            return;
        }
        try {
            this.transport = new stdio_js_1.StdioClientTransport({
                command: 'python3',
                args: ['-m', 'mcp_weather_server'],
            });
            this.client = new index_js_1.Client({
                name: 'tripnara-weather-client',
                version: '1.0.0',
            });
            await this.client.connect(this.transport);
            this.isConnected = true;
            console.error('✅ Weather MCP client connected');
        }
        catch (error) {
            console.error('❌ Failed to connect to Weather MCP server:', error);
            throw error;
        }
    }
    async disconnect() {
        if (this.client) {
            try {
                await this.client.close();
            }
            catch (error) {
                console.error('Error disconnecting Weather client:', error);
            }
            this.client = null;
            this.transport = null;
            this.isConnected = false;
        }
    }
    async ensureConnected() {
        if (!this.isConnected || !this.client) {
            await this.connect();
        }
        if (!this.client) {
            throw new Error('Weather client not initialized');
        }
        return this.client;
    }
    async listTools() {
        const client = await this.ensureConnected();
        return await client.listTools();
    }
    async getCurrentWeather(params) {
        const client = await this.ensureConnected();
        const result = await client.callTool({
            name: 'get_current_weather',
            arguments: params,
        });
        return result;
    }
    async getWeatherByDatetimeRange(params) {
        const client = await this.ensureConnected();
        const result = await client.callTool({
            name: 'get_weather_by_datetime_range',
            arguments: params,
        });
        return result;
    }
    async getCurrentDateTime(params) {
        const client = await this.ensureConnected();
        const result = await client.callTool({
            name: 'get_current_datetime',
            arguments: params,
        });
        return result;
    }
}
exports.WeatherMcpClient = WeatherMcpClient;
let weatherClientInstance = null;
function getWeatherClient() {
    if (!weatherClientInstance) {
        weatherClientInstance = new WeatherMcpClient();
    }
    return weatherClientInstance;
}
//# sourceMappingURL=weather-client.js.map