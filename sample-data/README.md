# AegisOps Sample Data

This directory contains sample data for testing AegisOps with your Splunk instance.

## Option 1: Use Splunk Internal Data (Already Working!)

The agents are now configured to query Splunk's internal indexes which have real data:
- `_internal` - Splunk internal logs (4M+ events)
- `_audit` - Audit/authentication events (500K+ events)

Just submit an incident and watch the agents analyze real Splunk data!

## Option 2: Upload Sample Data via Splunk Web

1. Go to your Splunk Web UI
2. Navigate to **Settings** → **Add Data** → **Upload**
3. Upload `app_events.csv` or `app_events.json`
4. Set the sourcetype to `app:logs`
5. Set the index to `main`

### File Descriptions

- **app_events.csv** - CSV format with 15 sample application events
- **app_events.json** - JSON format optimized for Splunk HEC

## Option 3: HTTP Event Collector (HEC)

### Setup HEC in Splunk Cloud

1. Go to **Settings** → **Data Inputs** → **HTTP Event Collector**
2. Click **New Token**
3. Name: `aegis-hec`
4. Select indexes: `main`
5. Copy the token

### Send Events via curl

```bash
# Replace with your HEC token and endpoint
HEC_TOKEN="your-hec-token"
SPLUNK_HEC="https://http-inputs-prd-p-0xryr.splunkcloud.com:443/services/collector"

# Send a single event
curl -k "$SPLUNK_HEC/event" \
  -H "Authorization: Splunk $HEC_TOKEN" \
  -d '{
    "sourcetype": "app:logs",
    "index": "main",
    "event": {
      "service": "payment-gateway",
      "level": "ERROR",
      "message": "Transaction timeout",
      "latency_ms": 30000
    }
  }'
```

### Send via AegisOps API

```bash
# Generate test data through AegisOps API
curl -X POST http://localhost:3001/test-data/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scenario": "payment_error", "count": 5}'

# Available scenarios:
# - payment_error: Payment service failures
# - auth_attack: Authentication attack simulation
# - api_latency: API latency issues
```

## Sample Incidents to Test

After loading data, try these incidents in AegisOps:

1. **Payment Outage**
   - Description: "Payment gateway showing high error rates and timeouts"
   - Services: payment-gateway, checkout

2. **Credential Stuffing Attack**
   - Description: "Multiple failed login attempts from suspicious IPs"
   - Services: user-auth

3. **Performance Degradation**
   - Description: "Slow response times across inventory and search services"
   - Services: inventory-api, search
