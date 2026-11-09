# ScrapeGraphAI MCP integration

AFG AI connects to the official ScrapeGraphAI remote MCP endpoint using Streamable HTTP.

## Railway variables
- `SGAI_API_KEY`: server-side API key.
- `SCRAPEGRAPH_MCP_URL`: optional override; defaults to `https://sgai-mcp-main.onrender.com/mcp`.

## Enabled tools
- `search`: runs alongside the configured primary search provider; results are deduplicated by URL.
- `scrape`: exposed to the research agent as `web_scrape` for public page extraction.

The connection is server-to-server. Credentials are never exposed to the browser. AFG AI validates public URLs before scraping and treats all MCP output as untrusted reference data. Tavily/9Router remain available if MCP is unavailable.
