"use client";

import { useState, ChangeEvent, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { GitBranch, LocateFixed, Search, Share2, Tags, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { GraphVisualization } from "@/components/graph/GraphVisualization";
import { GraphRef } from "@/components/graph/Graph";
import { RawTriplet } from "@/lib/types/graph";

interface UserDetailsProps {
  userID?: string;
}

type LocatorNode = {
  id: string;
  name: string;
  label: string;
  summary: string;
  degree: number;
};

type LocatorRelation = {
  id: string;
  relation: string;
  fact: string;
  sourceName: string;
  targetName: string;
};

const MAX_LOCATOR_ROWS = 40;

export function GraphClient({ userID: initialUserID }: UserDetailsProps) {
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);
  const [triplets, setTriplets] = useState<RawTriplet[]>([]);
  const [graphDialogOpen, setGraphDialogOpen] = useState(false);
  const graphRef = useRef<GraphRef>(null);

  const [sourceMode, setSourceMode] = useState<
    "neo4j" | "local" | "user" | "group"
  >("neo4j");
  const [entityId, setEntityId] = useState(
    initialUserID || "trading_os_macro_theme",
  );
  const [focus, setFocus] = useState("");
  const [graphLimit, setGraphLimit] = useState("500");
  const [loadedFocus, setLoadedFocus] = useState("");

  const graphIndex = useMemo(() => {
    const nodes = new Map<string, LocatorNode>();
    const labelCounts = new Map<string, number>();
    const relations: LocatorRelation[] = [];

    for (const triplet of triplets) {
      for (const node of [triplet.sourceNode, triplet.targetNode]) {
        const label = primaryLabel(node.labels);
        const existing = nodes.get(node.uuid);
        if (existing) {
          existing.degree += 1;
        } else {
          nodes.set(node.uuid, {
            id: node.uuid,
            name: node.name || node.uuid,
            label,
            summary: node.summary || "",
            degree: 1,
          });
          labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
        }
      }

      if (triplet.edge.type !== "_isolated_node_") {
        relations.push({
          id: triplet.edge.uuid,
          relation: triplet.edge.name || triplet.edge.type || "RELATION",
          fact: triplet.edge.fact || "",
          sourceName: triplet.sourceNode.name || triplet.sourceNode.uuid,
          targetName: triplet.targetNode.name || triplet.targetNode.uuid,
        });
      }
    }

    const sortedNodes = Array.from(nodes.values()).sort((a, b) => {
      if (b.degree !== a.degree) {
        return b.degree - a.degree;
      }
      return a.name.localeCompare(b.name);
    });

    const sortedLabels = Array.from(labelCounts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0]);
    });

    return {
      labels: sortedLabels,
      nodes: sortedNodes,
      relations,
      nodeCount: sortedNodes.length,
      relationCount: relations.length,
    };
  }, [triplets]);

  const locatorTerm = focus.trim().toLowerCase();
  const locatorNodes = useMemo(() => {
    const rows = locatorTerm
      ? graphIndex.nodes.filter((node) =>
          matchesText(locatorTerm, [
            node.name,
            node.label,
            node.summary,
            node.id,
          ]),
        )
      : graphIndex.nodes;
    return rows.slice(0, MAX_LOCATOR_ROWS);
  }, [graphIndex.nodes, locatorTerm]);

  const locatorRelations = useMemo(() => {
    const rows = locatorTerm
      ? graphIndex.relations.filter((relation) =>
          matchesText(locatorTerm, [
            relation.sourceName,
            relation.relation,
            relation.targetName,
            relation.fact,
            relation.id,
          ]),
        )
      : graphIndex.relations;
    return rows.slice(0, MAX_LOCATOR_ROWS);
  }, [graphIndex.relations, locatorTerm]);

  const buildTripletsUrl = (focusValue: string) => {
    const params = new URLSearchParams();
    const trimmedFocus = focusValue.trim();
    const trimmedLimit = graphLimit.trim();

    if (trimmedFocus) {
      params.set("focus", trimmedFocus);
    }
    if (trimmedLimit) {
      params.set("limit", trimmedLimit);
    }

    const query = params.toString();
    return `/api/graph/${sourceMode}/${encodeURIComponent(entityId)}/triplets${
      query ? `?${query}` : ""
    }`;
  };

  const handleLoadGraph = async (focusOverride?: string) => {
    if (!entityId.trim()) {
      toast.error("Please enter an ID");
      return;
    }

    const focusValue = focusOverride ?? focus;
    setIsLoadingGraph(true);
    try {
      const response = await fetch(buildTripletsUrl(focusValue));

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to load ${sourceMode} graph`);
      }

      const data = await response.json();
      setTriplets(data.triplets);
      setLoadedFocus(focusValue.trim());

      // Open the dialog when graph data is loaded
      setGraphDialogOpen(true);
    } catch (error) {
      console.error("Error loading graph:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to load graph",
      );
    } finally {
      setIsLoadingGraph(false);
    }
  };

  const handleClearFocus = () => {
    setFocus("");
    void handleLoadGraph("");
  };

  const handleLocateNode = (nodeId: string) => {
    graphRef.current?.zoomToNodeById(nodeId);
  };

  const handleLocateRelation = (relationId: string) => {
    graphRef.current?.zoomToLinkById(relationId);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 py-4">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleLoadGraph();
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={sourceMode === "neo4j" ? "default" : "outline"}
                onClick={() => {
                  setSourceMode("neo4j");
                  setEntityId("trading_os_macro_theme");
                }}
              >
                Neo4j Live
              </Button>
              <Button
                type="button"
                variant={sourceMode === "local" ? "default" : "outline"}
                onClick={() => {
                  setSourceMode("local");
                  setEntityId("trading-os-memory");
                }}
              >
                Trading-OS JSON
              </Button>
              <Button
                type="button"
                variant={sourceMode === "group" ? "default" : "outline"}
                onClick={() => setSourceMode("group")}
              >
                Zep Group
              </Button>
              <Button
                type="button"
                variant={sourceMode === "user" ? "default" : "outline"}
                onClick={() => setSourceMode("user")}
              >
                Zep User
              </Button>
            </div>

            <div className="flex-1 grid gap-2">
              <Label htmlFor="entity-id">
                {sourceMode === "neo4j"
                  ? "Neo4j Group ID"
                  : sourceMode === "local"
                    ? "Local Graph ID"
                    : sourceMode === "group"
                      ? "Group ID"
                      : "User ID"}
              </Label>
              <Input
                id="entity-id"
                placeholder={
                  sourceMode === "neo4j"
                    ? "trading_os_macro_theme"
                    : sourceMode === "local"
                      ? "trading-os-memory"
                      : sourceMode === "group"
                        ? "Enter group ID..."
                        : "Enter user ID..."
                }
                value={entityId}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setEntityId(e.target.value)
                }
              />
            </div>

            <Button
              type="submit"
              variant="default"
              size="lg"
              disabled={isLoadingGraph}
              className="mt-2 sm:mt-0 text-lg font-medium"
            >
              {isLoadingGraph ? (
                "Loading..."
              ) : (
                <>
                  <span className="mr-2">
                    {focus.trim() ? "Focus Graph" : "View Graph"}
                  </span>
                  <Share2 size={19} />
                </>
              )}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="graph-focus">Search / Focus</Label>
              <Input
                id="graph-focus"
                placeholder="AI_COOLING, PTON, macro, HAS_INDICATOR..."
                value={focus}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFocus(e.target.value)
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="graph-limit">Limit</Label>
              <Input
                id="graph-limit"
                type="number"
                min="1"
                max="2000"
                value={graphLimit}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setGraphLimit(e.target.value)
                }
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline" disabled={isLoadingGraph}>
                <Search size={17} className="mr-2" />
                Search
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isLoadingGraph || !focus.trim()}
                onClick={handleClearFocus}
              >
                <X size={17} className="mr-2" />
                Clear
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Graph Dialog */}
      <Dialog open={graphDialogOpen} onOpenChange={setGraphDialogOpen}>
        <DialogContent className="flex h-[100vh] w-[100vw] max-w-none flex-col overflow-hidden sm:max-w-none md:max-w-none lg:max-w-none">
          <DialogHeader>
            <DialogTitle>
              {sourceMode === "local"
                ? "Trading-OS JSON"
                : sourceMode === "neo4j"
                  ? "Trading-OS"
                  : sourceMode === "group"
                    ? "Group"
                    : "User"}{" "}
              Relationship Graph
            </DialogTitle>
            <DialogDescription>
              {triplets.length.toLocaleString()} relationship
              {triplets.length === 1 ? "" : "s"}
              {graphIndex.nodeCount
                ? ` across ${graphIndex.nodeCount.toLocaleString()} nodes`
                : ""}
              {loadedFocus ? ` focused on "${loadedFocus}"` : ""} from{" "}
              {sourceMode}
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void handleLoadGraph();
            }}
          >
            <div className="grid flex-1 gap-2">
              <Label htmlFor="dialog-graph-focus">Search / Focus</Label>
              <Input
                id="dialog-graph-focus"
                placeholder="Type an entity, relation, or fact..."
                value={focus}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFocus(e.target.value)
                }
              />
            </div>
            <Button type="submit" variant="outline" disabled={isLoadingGraph}>
              <Search size={17} className="mr-2" />
              Search
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoadingGraph || !focus.trim()}
              onClick={handleClearFocus}
            >
              <X size={17} className="mr-2" />
              Clear
            </Button>
          </form>

          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col overflow-hidden rounded-md border bg-background">
              <div className="border-b p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-muted px-3 py-2">
                    <div className="text-xs text-muted-foreground">Nodes</div>
                    <div className="text-lg font-semibold">
                      {graphIndex.nodeCount.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted px-3 py-2">
                    <div className="text-xs text-muted-foreground">
                      Relations
                    </div>
                    <div className="text-lg font-semibold">
                      {graphIndex.relationCount.toLocaleString()}
                    </div>
                  </div>
                </div>

                {graphIndex.labels.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Tags size={14} />
                      Entity Types
                    </div>
                    <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto pr-1">
                      {graphIndex.labels.slice(0, 12).map(([label, count]) => (
                        <button
                          key={label}
                          type="button"
                          className="rounded-full border px-2 py-1 text-xs hover:bg-muted"
                          onClick={() => setFocus(label)}
                        >
                          {label} {count}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Locate Nodes</h3>
                    <span className="text-xs text-muted-foreground">
                      {locatorNodes.length.toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {locatorNodes.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        className="w-full rounded-md border p-2 text-left transition-colors hover:bg-muted"
                        onClick={() => handleLocateNode(node.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {node.name}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="rounded bg-muted px-1.5 py-0.5">
                                {node.label}
                              </span>
                              <span>{node.degree} links</span>
                            </div>
                          </div>
                          <LocateFixed
                            size={16}
                            className="mt-0.5 shrink-0 text-muted-foreground"
                          />
                        </div>
                        {node.summary && (
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {node.summary}
                          </div>
                        )}
                      </button>
                    ))}
                    {locatorNodes.length === 0 && (
                      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        No loaded nodes match this focus.
                      </div>
                    )}
                  </div>
                </section>

                <section className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Trace Relations</h3>
                    <span className="text-xs text-muted-foreground">
                      {locatorRelations.length.toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {locatorRelations.map((relation) => (
                      <button
                        key={relation.id}
                        type="button"
                        className="w-full rounded-md border p-2 text-left transition-colors hover:bg-muted"
                        onClick={() => handleLocateRelation(relation.id)}
                      >
                        <div className="flex items-start gap-2">
                          <GitBranch
                            size={15}
                            className="mt-0.5 shrink-0 text-muted-foreground"
                          />
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">
                              {relation.sourceName}
                            </div>
                            <div className="truncate text-sm font-medium">
                              {relation.relation}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {relation.targetName}
                            </div>
                          </div>
                        </div>
                        {relation.fact && (
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {relation.fact}
                          </div>
                        )}
                      </button>
                    ))}
                    {locatorRelations.length === 0 && (
                      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        No loaded relations match this focus.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </aside>

            <div className="relative min-h-0 w-full">
              {triplets.length > 0 && (
                <GraphVisualization
                  ref={graphRef}
                  triplets={triplets}
                  width={window.innerWidth}
                  height={window.innerHeight * 0.68}
                  zoomOnMount={true}
                  className="h-[calc(100vh-15rem)] overflow-hidden rounded-md border border-border"
                />
              )}
              {triplets.length === 0 && (
                <div className="flex h-full min-h-[28rem] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  No graph relationships matched this query.
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGraphDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function primaryLabel(labels?: string[]): string {
  return labels?.find((label) => label !== "Entity") || "Entity";
}

function matchesText(term: string, values: Array<string | undefined>): boolean {
  return values.filter(Boolean).join(" ").toLowerCase().includes(term);
}
