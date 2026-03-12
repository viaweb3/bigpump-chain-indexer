# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start server with HMR (hot module reload)
npm run build        # Compile TypeScript to build/
npm start            # Run compiled server (production)

# Database
node ace migration:run       # Run pending migrations
node ace migration:rollback  # Rollback last migration batch

# Blockchain scanner (runs separately from API server)
node ace scan:blockchain          # Scan BSC (default)
node ace scan:blockchain --chain=bsc

# Webhook sender (runs separately)
node ace send:webhooks

# Code quality
npm run lint         # ESLint
npm run format       # Prettier
npm run typecheck    # TypeScript check (no emit)

# Tests
npm test                                              # All suites
node ace test --suite=unit                            # Unit only
node ace test --suite=functional                      # Functional only
node ace test tests/unit/specific.spec.ts             # Single file
```

## Architecture

This is an **AdonisJS v6** blockchain event indexer for BNB Chain (BSC). It has two independently running processes:

1. **HTTP API server** (`npm run dev` / `npm start`) — serves REST API at `http://localhost:3333`
2. **Blockchain scanner** (`node ace scan:blockchain`) — polls BSC for contract events and writes to DB
3. **Webhook sender** (`node ace send:webhooks`) — polls DB for unsent events and POSTs to configured webhook URL

### Data Flow

```
BSC RPC → BlockchainScannerService → PostgreSQL/TimescaleDB → REST API
                                                           → WebhookSenderService → SSE/Webhook endpoint
```

### Key Files

| Path | Purpose |
|------|---------|
| `app/services/blockchain_scanner_service.ts` | Core scanner: polls RPC, parses `Trade` and `NewPool` events, writes to DB. Contains `createBscScanner()` factory. |
| `app/services/webhook_sender_service.ts` | Polls DB for `webhook_sent=false` records and POSTs to configured URL. Supports both generic webhooks and SSE publish endpoint. |
| `commands/scan_blockchain.ts` | Ace command wrapping `BlockchainScannerService` |
| `commands/send_webhooks.ts` | Ace command wrapping `WebhookSenderService` |
| `start/routes.ts` | All routes under `/api/v1`: `/pools`, `/trades`, `/scanner-states` |
| `start/env.ts` | Environment variable schema and validation |
| `app/models/` | Lucid ORM models: `Pool`, `Trade`, `ScannerState` |
| `app/controllers/` | `PoolsController`, `TradesController`, `ScannerStatesController` |
| `app/contracts/` | ABI definitions for `BondingCurve` and `CreatePool` contracts |
| `database/migrations/` | TimescaleDB-compatible migrations (hypertables on `block_timestamp`) |

### Database

- **PostgreSQL + TimescaleDB** required. `block_timestamp` columns are hypertable partition keys.
- `pools` — NFT pool creation events (`NewPool`)
- `trades` — swap events (`Trade`); `side=1` buy, `side=2` sell
- `scanner_states` — persistent scanner progress (keyed by `chain_id` + `scanner_name`)
- Amounts stored as `bigint` strings (wei units); `token_price` and `market_cap` stored as `decimal(38,18)`

### Scanner Behavior

- Resumes from `last_processed_block` in DB on restart
- Processes blocks in configurable chunks (`SCANNER_CHUNK_SIZE`, default 1000)
- Auto-selects archive vs regular RPC based on block age vs `SCANNER_ARCHIVE_THRESHOLD` (default 128)
- Exponential backoff reconnect, up to 10 attempts
- Uses `Trade.firstOrCreate` / `Pool.firstOrCreate` keyed on `transactionHash` to avoid duplicates

### Adding a New Chain

1. Add env vars in `.env` and `start/env.ts`
2. Add a factory function (e.g. `createEthScanner()`) in `blockchain_scanner_service.ts`
3. Add a `case` in `commands/scan_blockchain.ts`

## Path Aliases

Defined in `package.json` `imports` field — use `#models/*`, `#services/*`, `#controllers/*`, `#utils/*`, etc. instead of relative imports.
