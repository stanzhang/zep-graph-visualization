"use client";

import { useState, ChangeEvent, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Search, Share2, X } from "lucide-react";
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
        <DialogContent className="max-w-none sm:max-w-none md:max-w-none lg:max-w-none w-[100vw] h-[100vh]">
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

          <div className="relative flex-1 w-full h-[calc(80vh-12rem)]">
            {triplets.length > 0 && (
              <GraphVisualization
                ref={graphRef}
                triplets={triplets}
                width={window.innerWidth}
                height={window.innerHeight * 0.75}
                zoomOnMount={true}
              />
            )}
            {triplets.length === 0 && (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No graph relationships matched this query.
              </div>
            )}
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
