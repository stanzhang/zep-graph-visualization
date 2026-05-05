# Zep Graph Visualization

A Next.js application for visualizing graph data using D3.js, built to work with [Zep](https://help.getzep.com). This is designed to serve as a reference implementation of Graph Visualization for Zep users in their applications.

Zep is a memory layer for AI assistants and agents that continuously learns from user interactions and changing business data. Zep ensures that your Agent has a complete and holistic view of the user, enabling you to build more personalized and accurate user experiences.

## Features

- Interactive graph visualization of knowledge graphs built with Zep
- Force-directed layout with D3.js
- Zoom and pan functionality
- Node and edge highlighting
- Node and edge inspection
- Dark and light mode support
- Custom node colors based on entity types
- Edge labeling

## Technology Stack

- [Next.js 15](https://nextjs.org/) with App Router
- [React 19](https://react.dev/)
- [D3.js](https://d3js.org/) for graph visualization
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Shadcn UI](https://ui.shadcn.com/) for UI components
- [Zep Cloud SDK](https://help.getzep.com/sdks/)

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Zep API key (if connecting to Zep Cloud)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/getzep/zep-graph-visualization.git
cd zep-graph-visualization
```

2. Install dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Set up environment variables:

Create a `.env.local` file in the root directory with the following variables:

```
ZEP_API_KEY=your_zep_api_key
```

### Running the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Usage

The application provides an interactive graph visualization of knowledge triplets from Zep. You can:

- Click on nodes to see their details
- Click on edges to see relationship information
- Zoom in/out using the mouse wheel
- Pan the graph by dragging
- Toggle between dark and light modes

## Trading-OS Graph Modes

This clone also supports two local `trading-os` modes for inspecting the local
Graphiti/Neo4j memory graph without sending trading memory to Zep Cloud.

### Neo4j Live

`Neo4j Live` is the default Trading-OS mode. The browser calls this app's
Next.js API route, the API route queries local Neo4j server-side, and the route
transforms the graph rows into the Zep `RawTriplet[]` shape for rendering.

Use `.env.local` if your local Neo4j settings differ from the defaults:

```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j
GRAPHITI_GROUP_ID=trading_os_macro_theme
TRADING_OS_GRAPH_LIMIT=500
```

Start this viewer and choose `Neo4j Live` with group id
`trading_os_macro_theme`.

Use `Search / Focus` to load a smaller live subgraph around a ticker, theme,
relation, or fact text, for example `AI_INFRASTRUCTURE`, `PTON`,
`HAS_INDICATOR`, or `theme/config`. Leave the field blank to load the full
group graph. `Limit` caps the number of Neo4j relationships returned.

### JSON Snapshot

`Trading-OS JSON` is the fallback/debug mode. It reads a local triplet snapshot
exported from `trading-os`.

From `/Users/sz/github/trading-os`:

```bash
PYTHONPATH=engine/src \
engine/.venv/bin/python -m engine.cli memory export-zep-triplets \
  --output /Users/sz/github/zep-graph-visualization/public/trading-os/trading-os-memory.json
```

Then start this viewer and choose `Trading-OS JSON` with graph id
`trading-os-memory`.

## License

[MIT](LICENSE)
