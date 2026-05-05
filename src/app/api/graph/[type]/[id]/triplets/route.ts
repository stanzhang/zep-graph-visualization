import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import neo4j from "neo4j-driver";
import { Node, Edge, RawTriplet } from "@/lib/types/graph";
import { createTriplets } from "@/lib/utils/graph";
import { ZepClient } from "@getzep/zep-cloud";
import { EntityNode, EntityEdge } from "@getzep/zep-cloud/api";

interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
}

const supportedResourceTypes = ["user", "group", "local", "neo4j"] as const;
type ResourceType = (typeof supportedResourceTypes)[number];
type ZepResourceType = Extract<ResourceType, "user" | "group">;
const NODE_BATCH_SIZE = 100;
const EDGE_BATCH_SIZE = 100;
const DEFAULT_TRADING_OS_GROUP_ID = "trading_os_macro_theme";

const transformSDKNode = (node: EntityNode): Node => {
  return {
    uuid: node.uuid,
    name: node.name,
    summary: node.summary,
    labels: node.labels,
    created_at: node.createdAt,
    updated_at: "",
    attributes: node.attributes,
  };
};

const transformSDKEdge = (edge: EntityEdge): Edge => {
  return {
    uuid: edge.uuid,
    source_node_uuid: edge.sourceNodeUuid,
    target_node_uuid: edge.targetNodeUuid,
    type: "",
    name: edge.name,
    fact: edge.fact,
    episodes: edge.episodes,
    created_at: edge.createdAt,
    updated_at: "",
    valid_at: edge.validAt,
    expired_at: edge.expiredAt,
    invalid_at: edge.invalidAt,
  };
};

async function getNodes(
  type: ZepResourceType,
  id: string,
  zep: ZepClient,
  cursor?: string,
): Promise<PaginatedResponse<Node>> {
  try {
    let nodes;
    if (type === "user") {
      nodes = await zep.graph.node.getByUserId(id, {
        uuidCursor: cursor || "",
        limit: NODE_BATCH_SIZE,
      });
    } else {
      nodes = await zep.graph.node.getByGroupId(id, {
        uuidCursor: cursor || "",
        limit: NODE_BATCH_SIZE,
      });
    }

    const transformedNodes = nodes.map(transformSDKNode);
    return {
      data: transformedNodes,
      nextCursor:
        transformedNodes.length > 0
          ? transformedNodes[transformedNodes.length - 1].uuid
          : null,
    };
  } catch (error) {
    console.error("Error fetching nodes:", error);
    return { data: [], nextCursor: null };
  }
}

async function getEdges(
  type: ZepResourceType,
  id: string,
  zep: ZepClient,
  cursor?: string,
): Promise<PaginatedResponse<Edge>> {
  try {
    let edges;
    if (type === "user") {
      edges = await zep.graph.edge.getByUserId(id, {
        uuidCursor: cursor || "",
        limit: EDGE_BATCH_SIZE,
      });
    } else {
      edges = await zep.graph.edge.getByGroupId(id, {
        uuidCursor: cursor || "",
        limit: EDGE_BATCH_SIZE,
      });
    }

    const transformedEdges = edges.map(transformSDKEdge);
    return {
      data: transformedEdges,
      nextCursor:
        transformedEdges.length > 0
          ? transformedEdges[transformedEdges.length - 1].uuid
          : null,
    };
  } catch (error) {
    console.error("Error fetching edges:", error);
    return { data: [], nextCursor: null };
  }
}

async function getAllNodes(
  type: ZepResourceType,
  id: string,
  zep: ZepClient,
): Promise<Node[]> {
  let allNodes: Node[] = [];
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const { data: nodes, nextCursor } = await getNodes(type, id, zep, cursor);
    allNodes = [...allNodes, ...nodes];

    if (nextCursor === null || nodes.length === 0) {
      hasMore = false;
    } else {
      cursor = nextCursor;
    }
  }

  return allNodes;
}

async function getAllEdges(
  type: ZepResourceType,
  id: string,
  zep: ZepClient,
): Promise<Edge[]> {
  let allEdges: Edge[] = [];
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const { data: edges, nextCursor } = await getEdges(type, id, zep, cursor);
    allEdges = [...allEdges, ...edges];

    if (nextCursor === null || edges.length === 0) {
      hasMore = false;
    } else {
      cursor = nextCursor;
    }
  }

  return allEdges;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: ResourceType; id: string }> },
) {
  try {
    const { type, id } = await params;

    if (!supportedResourceTypes.includes(type as ResourceType)) {
      return NextResponse.json(
        { error: "Invalid resource type" },
        { status: 400 },
      );
    }

    if (type === "local") {
      const triplets = await readLocalTriplets(id);
      return NextResponse.json({
        triplets: filterTriplets(triplets, request.nextUrl.searchParams),
      });
    }

    if (type === "neo4j") {
      const triplets = await readNeo4jTriplets(
        id,
        request.nextUrl.searchParams,
      );
      return NextResponse.json({ triplets });
    }

    const ZEP_API_KEY = process.env.ZEP_API_KEY;

    if (!ZEP_API_KEY) {
      return NextResponse.json(
        { error: "ZEP_API_KEY is not set" },
        { status: 500 },
      );
    }

    const zep = new ZepClient({ apiKey: ZEP_API_KEY });

    // Fetch all nodes and edges using the batch completion wrappers
    const [nodes, edges] = await Promise.all([
      getAllNodes(type, id, zep),
      getAllEdges(type, id, zep),
    ]);

    if (!nodes.length && !edges.length) {
      return NextResponse.json({ triplets: [] });
    }

    // Combine nodes and edges into triplets
    const triplets = filterTriplets(
      createTriplets(edges, nodes),
      request.nextUrl.searchParams,
    );

    return NextResponse.json({ triplets });
  } catch (error) {
    console.error("Error fetching triplets:", error);
    return NextResponse.json(
      { error: "Failed to fetch graph data" },
      { status: 500 },
    );
  }
}

async function readLocalTriplets(id: string): Promise<RawTriplet[]> {
  const configuredPath = process.env.TRADING_OS_GRAPH_TRIPLETS_PATH;
  const safeId = id.replace(/[^a-zA-Z0-9._-]/g, "");
  const graphPath = configuredPath
    ? configuredPath
    : path.join(process.cwd(), "public", "trading-os", `${safeId}.json`);
  const raw = await readFile(graphPath, "utf-8");
  const payload = JSON.parse(raw);
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.triplets)) {
    return payload.triplets;
  }
  throw new Error(`Local graph file does not contain triplets: ${graphPath}`);
}

async function readNeo4jTriplets(
  id: string,
  searchParams: URLSearchParams,
): Promise<RawTriplet[]> {
  const uri = process.env.NEO4J_URI || "bolt://localhost:7687";
  const user = process.env.NEO4J_USER || "neo4j";
  const password = process.env.NEO4J_PASSWORD || "password";
  const database = process.env.NEO4J_DATABASE || "neo4j";
  const groupId =
    id ||
    process.env.TRADING_OS_MEMORY_GROUP_ID ||
    process.env.GRAPHITI_GROUP_ID ||
    DEFAULT_TRADING_OS_GROUP_ID;
  const focus = (searchParams.get("focus") || "").trim().toLowerCase();
  const limit = parseLimit(searchParams.get("limit"));
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  try {
    const session = driver.session({ database });
    try {
      const result = await session.run(
        `
        MATCH (source:MemoryEntity)-[rel:MEMORY_RELATION]->(target:MemoryEntity)
        WHERE source.group_id = $groupId
          AND target.group_id = $groupId
          AND (
            $focus = ''
            OR toLower(source.name) CONTAINS $focus
            OR toLower(target.name) CONTAINS $focus
            OR toLower(coalesce(rel.fact, '')) CONTAINS $focus
            OR toLower(coalesce(rel.relation, '')) CONTAINS $focus
          )
        OPTIONAL MATCH (fact:MemoryFact {fact_id: rel.fact_id})
        OPTIONAL MATCH (fact)-[:FROM_EPISODE]->(episode:MemoryEpisode)
        RETURN
          source.entity_key AS source_key,
          source.name AS source_name,
          source.entity_type AS source_type,
          source.summary AS source_summary,
          target.entity_key AS target_key,
          target.name AS target_name,
          target.entity_type AS target_type,
          target.summary AS target_summary,
          rel.fact_id AS fact_id,
          coalesce(fact.relation, rel.relation) AS relation,
          coalesce(fact.fact, rel.fact) AS fact,
          coalesce(fact.valid_at, rel.valid_at) AS valid_at,
          coalesce(fact.confidence, rel.confidence) AS confidence,
          fact.source_episode_id AS source_episode_id,
          episode.name AS episode_name,
          episode.domain AS episode_domain,
          episode.event_type AS episode_type,
          episode.reference_time AS episode_reference_time,
          source.group_id AS group_id
        ORDER BY valid_at DESC, relation, source_name, target_name
        LIMIT $limit
        `,
        { groupId, focus, limit: neo4j.int(limit) },
      );
      return dedupeTriplets(
        result.records.flatMap((record) => {
          const row = {
            source_key: asText(record.get("source_key")),
            source_name: asText(record.get("source_name")),
            source_type: asText(record.get("source_type") || "MemoryEntity"),
            source_summary: asText(record.get("source_summary")),
            target_key: asText(record.get("target_key")),
            target_name: asText(record.get("target_name")),
            target_type: asText(record.get("target_type") || "MemoryEntity"),
            target_summary: asText(record.get("target_summary")),
            fact_id: asText(record.get("fact_id")),
            relation: asText(record.get("relation") || "MEMORY_RELATION"),
            fact: asText(record.get("fact")),
            valid_at: asText(record.get("valid_at")),
            confidence: asText(record.get("confidence")),
            source_episode_id: asText(record.get("source_episode_id")),
            episode_name: asText(record.get("episode_name")),
            episode_domain: asText(record.get("episode_domain")),
            episode_type: asText(record.get("episode_type")),
            episode_reference_time: asText(
              record.get("episode_reference_time"),
            ),
            group_id: asText(record.get("group_id")),
          };
          const triplets = [neo4jFactTriplet(row)];
          const episodeTriplet = neo4jEpisodeTriplet(row);
          if (episodeTriplet) {
            triplets.push(episodeTriplet);
          }
          return triplets;
        }),
      );
    } finally {
      await session.close();
    }
  } finally {
    await driver.close();
  }
}

type Neo4jMemoryRow = {
  source_key: string;
  source_name: string;
  source_type: string;
  source_summary: string;
  target_key: string;
  target_name: string;
  target_type: string;
  target_summary: string;
  fact_id: string;
  relation: string;
  fact: string;
  valid_at: string;
  confidence: string;
  source_episode_id: string;
  episode_name: string;
  episode_domain: string;
  episode_type: string;
  episode_reference_time: string;
  group_id: string;
};

function neo4jFactTriplet(row: Neo4jMemoryRow): RawTriplet {
  return {
    sourceNode: zepNode({
      uuid: row.source_key,
      name: row.source_name,
      labels: ["Entity", row.source_type || "MemoryEntity"],
      summary: row.source_summary,
      attributes: { group_id: row.group_id },
      created_at: row.valid_at,
    }),
    edge: zepEdge({
      uuid: row.fact_id,
      source_node_uuid: row.source_key,
      target_node_uuid: row.target_key,
      relation: row.relation || "MEMORY_RELATION",
      fact: row.fact,
      episodes: row.source_episode_id ? [row.source_episode_id] : [],
      valid_at: row.valid_at,
    }),
    targetNode: zepNode({
      uuid: row.target_key,
      name: row.target_name,
      labels: ["Entity", row.target_type || "MemoryEntity"],
      summary: row.target_summary,
      attributes: { group_id: row.group_id },
      created_at: row.valid_at,
    }),
  };
}

function neo4jEpisodeTriplet(row: Neo4jMemoryRow): RawTriplet | null {
  if (!row.source_episode_id) {
    return null;
  }
  const factNodeUuid = `memory_fact:${row.fact_id}`;
  const episodeNodeUuid = `memory_episode:${row.source_episode_id}`;
  return {
    sourceNode: zepNode({
      uuid: factNodeUuid,
      name: row.relation || row.fact_id,
      labels: ["Entity", "MemoryFact"],
      summary: row.fact,
      attributes: {
        fact_id: row.fact_id,
        confidence: row.confidence,
        valid_at: row.valid_at,
      },
      created_at: row.valid_at,
    }),
    edge: zepEdge({
      uuid: `${row.fact_id}:from_episode`,
      source_node_uuid: factNodeUuid,
      target_node_uuid: episodeNodeUuid,
      relation: "FROM_EPISODE",
      fact: `Fact ${row.fact_id} came from episode ${row.source_episode_id}.`,
      episodes: [row.source_episode_id],
      valid_at: row.valid_at,
    }),
    targetNode: zepNode({
      uuid: episodeNodeUuid,
      name: row.source_episode_id,
      labels: ["Entity", "MemoryEpisode"],
      summary: row.episode_name || row.episode_type,
      attributes: {
        domain: row.episode_domain,
        event_type: row.episode_type,
        reference_time: row.episode_reference_time,
      },
      created_at: row.episode_reference_time,
    }),
  };
}

function zepNode(args: {
  uuid: string;
  name: string;
  labels: string[];
  summary?: string;
  attributes?: Record<string, string>;
  created_at?: string;
}): Node {
  return {
    uuid: args.uuid,
    name: args.name,
    summary: args.summary || "",
    labels: args.labels,
    attributes: args.attributes || {},
    created_at: args.created_at || "",
    updated_at: "",
  };
}

function zepEdge(args: {
  uuid: string;
  source_node_uuid: string;
  target_node_uuid: string;
  relation: string;
  fact?: string;
  episodes?: string[];
  valid_at?: string;
}): Edge {
  return {
    uuid: args.uuid,
    source_node_uuid: args.source_node_uuid,
    target_node_uuid: args.target_node_uuid,
    type: args.relation,
    name: args.relation,
    fact: args.fact || "",
    episodes: args.episodes || [],
    created_at: args.valid_at || "",
    updated_at: "",
    valid_at: args.valid_at || "",
    invalid_at: "",
    expired_at: "",
  };
}

function dedupeTriplets(triplets: RawTriplet[]): RawTriplet[] {
  const seen = new Set<string>();
  const deduped: RawTriplet[] = [];
  for (const triplet of triplets) {
    const key = JSON.stringify({
      source: triplet.sourceNode.uuid,
      edge: triplet.edge.uuid,
      target: triplet.targetNode.uuid,
    });
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(triplet);
  }
  return deduped;
}

function filterTriplets(
  triplets: RawTriplet[],
  searchParams: URLSearchParams,
): RawTriplet[] {
  const focus = (searchParams.get("focus") || "").trim().toLowerCase();
  const limit = parseLimit(searchParams.get("limit"));
  const filtered = focus
    ? triplets.filter((triplet) => tripletMatchesFocus(triplet, focus))
    : triplets;
  return filtered.slice(0, limit);
}

function tripletMatchesFocus(triplet: RawTriplet, focus: string): boolean {
  const haystack = [
    triplet.sourceNode.name,
    triplet.sourceNode.summary,
    triplet.sourceNode.labels?.join(" "),
    Object.values(triplet.sourceNode.attributes || {}).join(" "),
    triplet.edge.name,
    triplet.edge.type,
    triplet.edge.fact,
    triplet.targetNode.name,
    triplet.targetNode.summary,
    triplet.targetNode.labels?.join(" "),
    Object.values(triplet.targetNode.attributes || {}).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(focus);
}

function asText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function parseLimit(raw: string | null): number {
  const limit = Number.parseInt(
    raw || process.env.TRADING_OS_GRAPH_LIMIT || "500",
    10,
  );
  if (!Number.isFinite(limit) || limit <= 0) {
    return 500;
  }
  return Math.min(limit, 2000);
}
