# AegisOps

**Autonomous Enterprise Reliability & Security Nexus**

A multi-agent AI platform that unifies Security, Observability, and Platform operations using Splunk's Model Context Protocol (MCP) Server.

Built for the [Splunk Hackathon 2026](https://splunk.devpost.com).

## The Concept

Most AI operations platforms are siloed—they fix a bug, block an IP, or write a query. **AegisOps** combines all three using the Splunk MCP Server. By looking across Security, Observability, and Platform architecture simultaneously, our agentic platform doesn't just discover an outage—it uncovers if the outage is a cyberattack, neutralizes the threat, fixes the underlying code, and optimizes the resulting Splunk data stream.

## Architecture

```
                    ┌─────────────────┐
                    │  Incident In    │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │         PARALLEL            │
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │  Healer Agent   │           │ Sentinel Agent  │
    │  (Observability)│           │   (Security)    │
    └────────┬────────┘           └────────┬────────┘
             │                             │
             └──────────────┬──────────────┘
                            │
                    ┌───────▼───────┐
                    │   Correlator  │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │   Architect   │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │ Human Review  │
                    └───────────────┘
```

### Agent Roles

| Agent | Domain | Responsibility |
|-------|--------|----------------|
| **Healer** | Observability | Analyzes latency, errors, traces. Identifies root causes. |
| **Sentinel** | Security | Cross-references IPs, detects attack vectors, proposes WAF rules. |
| **Correlator** | Synthesis | Merges findings, determines incident type and severity. |
| **Architect** | Platform/DX | Generates SPL queries, Edge Processor rules, code patches. |

## Tech Stack

- **Backend**: Node.js, TypeScript, Express, WebSocket
- **Agent Framework**: LangGraph JS (parallel agent execution)
- **LLM**: Anthropic Claude
- **Frontend**: React 18 + Vite + TailwindCSS
- **Splunk Integration**: MCP Server (JSON-RPC)

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- Anthropic API key

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/aegis-ops.git
cd aegis-ops

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Add your Anthropic API key to .env
# ANTHROPIC_API_KEY=your-key-here

# Build all packages
npm run build

# Start development servers
npm run dev
```

### Access

- **Frontend**: http://localhost:5173
- **API**: http://localhost:3001
- **WebSocket**: ws://localhost:3001/ws

## Usage

1. Open the Mission Control dashboard at http://localhost:5173
2. Click "Load Demo" to populate a sample incident scenario
3. Click "Analyze Incident" to trigger the agent workflow
4. Watch the Agent Activity Stream as Healer and Sentinel analyze in parallel
5. Review the Execution Plan when ready
6. Click "Approve & Execute" to run the remediation

## Project Structure

```
aegis-ops/
├── apps/
│   ├── api/          # Backend (Express + LangGraph)
│   └── web/          # Frontend (React + Vite)
├── packages/
│   └── shared/       # Shared TypeScript types
└── package.json      # Monorepo root
```

## Splunk MCP Integration

AegisOps uses the following Splunk MCP tools:

| Tool | Usage |
|------|-------|
| `search_splunk` | Query APM traces, firewall logs, auth events |
| `indexes_and_sourcetypes` | Discover available data sources |
| `saia_generate_spl` | AI-assisted SPL query generation |
| `saia_explain_spl` | Explain complex SPL queries |

### Demo Mode

By default, AegisOps runs with `SPLUNK_MODE=mock`, using realistic simulated data. To connect to a real Splunk instance:

```bash
SPLUNK_MODE=live
SPLUNK_MCP_ENDPOINT=http://your-splunk:8089
SPLUNK_TOKEN=your-token
```

## License

MIT
