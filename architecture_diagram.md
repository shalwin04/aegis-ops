# AegisOps Architecture Diagram

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AEGISOPS                                        │
│                 Autonomous Incident Response Platform                        │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │   DATA SOURCES  │
                              └────────┬────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
┌───────────────┐            ┌─────────────────┐            ┌───────────────┐
│  Splunk APM   │            │ Splunk Security │            │   GitHub      │
│  (Traces,     │            │ (Firewall, WAF, │            │   (Code       │
│   Metrics)    │            │  Auth Logs)     │            │   Repos)      │
└───────┬───────┘            └────────┬────────┘            └───────┬───────┘
        │                             │                             │
        └─────────────────────────────┼─────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │      SPLUNK MCP SERVER          │
                    │   (Model Context Protocol)      │
                    │                                 │
                    │  Tools:                         │
                    │  • splunk_run_query             │
                    │  • splunk_get_indexes           │
                    │  • saia_generate_spl            │
                    │  • saia_explain_spl             │
                    └────────────────┬────────────────┘
                                     │
                                     │ JSON-RPC 2.0
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AEGISOPS BACKEND                                   │
│                         (Node.js + LangGraph)                                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      ANOMALY DETECTOR                                  │  │
│  │              (Continuous Splunk Monitoring)                            │  │
│  │                                                                        │  │
│  │  • Latency Spikes     • Error Surges                                   │  │
│  │  • Security Threats   • Auth Attacks                                   │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
│                                  ▼                                           │
│                        ┌─────────────────┐                                   │
│                        │  INCIDENT IN    │                                   │
│                        └────────┬────────┘                                   │
│                                 │                                            │
│              ┌──────────────────┴──────────────────┐                         │
│              │           PARALLEL                  │                         │
│              ▼                                     ▼                         │
│    ┌─────────────────┐                   ┌─────────────────┐                 │
│    │  HEALER AGENT   │                   │ SENTINEL AGENT  │                 │
│    │  (Observability)│                   │   (Security)    │                 │
│    │                 │                   │                 │                 │
│    │ • APM Traces    │                   │ • Firewall Logs │                 │
│    │ • Latency Stats │                   │ • Auth Events   │                 │
│    │ • Error Rates   │                   │ • Threat Intel  │                 │
│    │ • Root Cause    │                   │ • Attack Vector │                 │
│    └────────┬────────┘                   └────────┬────────┘                 │
│             │                                     │                          │
│             └──────────────┬──────────────────────┘                          │
│                            │                                                 │
│                            ▼                                                 │
│                  ┌─────────────────┐                                         │
│                  │   CORRELATOR    │                                         │
│                  │                 │                                         │
│                  │ • Merge Findings│                                         │
│                  │ • Classify Type │                                         │
│                  │ • Score Severity│                                         │
│                  │ • Query Memory  │                                         │
│                  └────────┬────────┘                                         │
│                           │                                                  │
│                           ▼                                                  │
│                  ┌─────────────────┐                                         │
│                  │   ARCHITECT     │                                         │
│                  │                 │                                         │
│                  │ • Generate Plan │                                         │
│                  │ • WAF Rules     │                                         │
│                  │ • Edge Processor│                                         │
│                  │ • Code Fixes    │◄────────── GitHub API                   │
│                  │ • Blast Radius  │            (Analyze Repo)               │
│                  └────────┬────────┘                                         │
│                           │                                                  │
│                           ▼                                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      EXECUTION ENGINE                                  │  │
│  │                                                                        │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │  │
│  │  │WAF Rule │ │Network  │ │Splunk   │ │Slack    │ │GitHub   │          │  │
│  │  │         │ │Isolation│ │Alert    │ │Notify   │ │PR       │          │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                           │                                                  │
│                           ▼                                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                   INSTITUTIONAL MEMORY                                 │  │
│  │              (Splunk Index: aegis:agent_decision)                      │  │
│  │                                                                        │  │
│  │  • Past Incidents    • Approval History    • Success Rates             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ WebSocket + SSE
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AEGISOPS FRONTEND                                  │
│                         (React + TailwindCSS)                                │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Dashboard  │  │   Agent     │  │ Remediation │  │  Settings   │         │
│  │             │  │   Stream    │  │    Plan     │  │             │         │
│  │ • Incidents │  │ • Real-time │  │ • Actions   │  │ • Splunk    │         │
│  │ • Metrics   │  │   Thinking  │  │ • Code Diff │  │ • GitHub    │         │
│  │ • History   │  │ • Tool Calls│  │ • Approve   │  │ • Slack     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. DETECTION
   Splunk Data ──► Anomaly Detector ──► Incident Created
                        │
                        ▼
              ┌─────────────────┐
              │ Latency > 1000ms│
              │ Error Rate > 5% │
              │ Suspicious IPs  │
              │ Failed Logins   │
              └─────────────────┘

2. ANALYSIS (Parallel)
   ┌─────────────────────────────────────────┐
   │                                         │
   │  Healer ─────┐         ┌───── Sentinel  │
   │      │       │         │         │      │
   │      ▼       ▼         ▼         ▼      │
   │   [Splunk MCP Queries in Parallel]      │
   │                                         │
   └─────────────────────────────────────────┘

3. CORRELATION
   Healer Findings ──┐
                     ├──► Correlator ──► Verdict
   Sentinel Findings─┘         │
                               ▼
                    ┌─────────────────┐
                    │ Type: mixed     │
                    │ Confidence: 99% │
                    │ Severity: high  │
                    └─────────────────┘

4. REMEDIATION
   ┌─────────────────────────────────────────┐
   │            Architect Agent              │
   │                                         │
   │  GitHub Repo ──► Analyze ──► Code Fix   │
   │                                         │
   │  Actions:                               │
   │  • WAF Rule (block IPs)                 │
   │  • Network Isolation                    │
   │  • Splunk Alert                         │
   │  • Code Patch (PR)                      │
   └─────────────────────────────────────────┘

5. EXECUTION
   ┌─────────────────────────────────────────┐
   │  [Auto-Execute]     [Human Approval]    │
   │       │                    │            │
   │       ▼                    ▼            │
   │  • WAF Rules          • GitHub PR       │
   │  • Alerts               Merge           │
   │  • Notifications                        │
   └─────────────────────────────────────────┘

6. LEARNING
   Execution Results ──► Splunk Memory Index
                               │
                               ▼
                    Future incidents use
                    historical patterns
```

## Technology Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  React 18 │ Vite │ TailwindCSS │ TypeScript │ SSE               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP / WebSocket / SSE
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND                                   │
│  Node.js │ Express │ TypeScript │ LangGraph │ Anthropic Claude  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ JSON-RPC 2.0 (MCP Protocol)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SPLUNK PLATFORM                              │
│  MCP Server │ Splunk Cloud │ APM │ Security │ SAIA              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     INTEGRATIONS                                 │
│  GitHub API │ Slack Webhooks │ Cloudflare WAF │ PagerDuty       │
└─────────────────────────────────────────────────────────────────┘
```

## Agent Communication

```
┌──────────────────────────────────────────────────────────────────┐
│                    LangGraph StateGraph                          │
│                                                                  │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐       │
│  │ trigger │───►│ parallel│───►│correlate│───►│architect│       │
│  │         │    │         │    │         │    │         │       │
│  └─────────┘    └────┬────┘    └─────────┘    └────┬────┘       │
│                      │                              │            │
│               ┌──────┴──────┐                       │            │
│               │             │                       │            │
│               ▼             ▼                       ▼            │
│          ┌────────┐    ┌────────┐              ┌────────┐        │
│          │ healer │    │sentinel│              │execute │        │
│          └────────┘    └────────┘              └────────┘        │
│                                                                  │
│  State: {                                                        │
│    incidentId, trigger, severity,                                │
│    healerFindings, sentinelFindings,                             │
│    correlationVerdict, executionPlan,                            │
│    status, errors                                                │
│  }                                                               │
└──────────────────────────────────────────────────────────────────┘
```
