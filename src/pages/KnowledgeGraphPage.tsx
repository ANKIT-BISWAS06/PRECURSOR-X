import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface GraphNode {
  id: string;
  name: string;
  type: 'outcome' | 'hazard' | 'barrier' | 'asset' | 'human_factor';
  x: number;
  y: number;
  status?: 'critical' | 'failed' | 'mitigating' | 'nominal';
  description: string;
  connections: string[];
  metrics: {
    failureProb: string;
    incidentsCount: number | string;
    decayScore: string;
  };
}

// Logical SVG viewport the graph is drawn into (matches the <svg viewBox> below).
// Since the <svg> itself scales this viewBox to fill whatever size its container
// is, normalizing node coordinates into this fixed logical space keeps the graph
// correctly positioned at every screen size without any resize listeners.
const GRAPH_VIEW_WIDTH = 920;
const GRAPH_VIEW_HEIGHT = 520;
// Padding keeps node circles (radius up to ~32) and their labels from being
// clipped at the viewport edge.
const GRAPH_PAD_X = 90;
const GRAPH_PAD_Y = 80;

/**
 * Maps arbitrary stored node coordinates (which may fall far outside the SVG
 * viewport — the database is free to store whatever topology/layout hints it
 * wants) into the graph's visible drawing area, preserving relative spacing.
 * Falls back to centering when every node shares the same x or y (span = 0).
 */
function normalizeCoordinates(rawPoints: Array<{ x: number | null; y: number | null }>) {
  const xs = rawPoints.map((p) => p.x).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const ys = rawPoints.map((p) => p.y).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 0;
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const usableW = GRAPH_VIEW_WIDTH - GRAPH_PAD_X * 2;
  const usableH = GRAPH_VIEW_HEIGHT - GRAPH_PAD_Y * 2;

  const toX = (val: number | null): number => {
    if (val === null || !Number.isFinite(val)) return GRAPH_VIEW_WIDTH / 2;
    return spanX > 0 ? GRAPH_PAD_X + ((val - minX) / spanX) * usableW : GRAPH_VIEW_WIDTH / 2;
  };
  const toY = (val: number | null): number => {
    if (val === null || !Number.isFinite(val)) return GRAPH_VIEW_HEIGHT / 2;
    return spanY > 0 ? GRAPH_PAD_Y + ((val - minY) / spanY) * usableH : GRAPH_VIEW_HEIGHT / 2;
  };

  return { toX, toY };
}

export const KnowledgeGraphPage: React.FC = () => {
  const navigate = useNavigate();

  // Nodes state & selection (strictly backend-authoritative)
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('node-sif');
  const [searchFilter, setSearchFilter] = useState('');
  const [layoutMode, setLayoutMode] = useState<'force' | 'causal' | 'barrier'>('causal');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const didMoveRef = useRef(false);

  const fetchGraph = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getKnowledgeGraph();
      const rawNodes = res.nodes || [];
      setEdges(res.edges || []);

      // Normalize whatever coordinates PostgreSQL returns into the graph's
      // visible viewport — the DB values themselves are left untouched.
      const { toX, toY } = normalizeCoordinates(
        rawNodes.map((n: any) => ({
          x: typeof n.x === 'number' ? n.x : null,
          y: typeof n.y === 'number' ? n.y : null
        }))
      );

      const mappedNodes: GraphNode[] = rawNodes.map((n: any) => {
        let mappedType: GraphNode['type'] = 'hazard';
        if (n.type === 'barrier' || n.type === 'rule') mappedType = 'barrier';
        else if (n.type === 'outcome') mappedType = 'outcome';
        else if (n.type === 'hub' || n.type === 'asset') mappedType = 'asset';
        else if (n.type === 'human_factor') mappedType = 'human_factor';
        else if (n.type === 'hazard') mappedType = 'hazard';

        const probNum = n.sifWeight !== null && n.sifWeight !== undefined ? Math.round(n.sifWeight * 100) : null;
        const failureProb = probNum !== null ? `${probNum.toFixed(1)}%` : 'N/A';
        const incidentsCount = n.incidentsCount !== null && n.incidentsCount !== undefined ? n.incidentsCount : 'N/A';
        const decayScore =
          probNum !== null
            ? n.status === 'failed'
              ? `${probNum}% Decay`
              : n.status === 'critical'
              ? 'High Risk'
              : n.status === 'nominal'
              ? 'Effective'
              : 'Moderate'
            : n.status === 'critical'
            ? 'High Risk'
            : n.status === 'nominal'
            ? 'Effective'
            : n.status
            ? 'Moderate'
            : 'N/A';

        return {
          id: n.id,
          name: n.label || n.name || n.id,
          type: mappedType,
          x: toX(typeof n.x === 'number' ? n.x : null),
          y: toY(typeof n.y === 'number' ? n.y : null),
          status: (n.status || 'nominal') as any,
          description: n.details || n.description || '',
          connections: n.connections || [],
          metrics: {
            failureProb,
            incidentsCount,
            decayScore
          }
        };
      });

      setNodes(mappedNodes);
      if (mappedNodes.length > 0) {
        setSelectedNodeId((prev) => {
          if (mappedNodes.some((n) => n.id === prev)) return prev;
          return mappedNodes[0].id;
        });
      }
    } catch (err: any) {
      setError(err.message || 'Could not load the Knowledge Graph.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // If target is inside a node, do not initiate viewport pan
    const target = e.target as HTMLElement | SVGElement;
    if (target.closest('[data-node="true"]')) {
      return;
    }
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    setIsDragging(true);
    didMoveRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      didMoveRef.current = true;
    }
    setPan({
      x: Math.round(dragStartRef.current.panX + dx),
      y: Math.round(dragStartRef.current.panY + dy)
    });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging) {
      try {
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
      setIsDragging(false);
      dragStartRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoomLevel((z) => Math.min(Math.max(Number((z + delta).toFixed(2)), 0.5), 2.2));
  };

  const handleResetView = () => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
    showToast('Reset graph viewport to 100% and centered');
  };
  const [lastSimulationDelta, setLastSimulationDelta] = useState<{
    barrierName: string;
    action: string;
    barrierPrevProb: string;
    barrierNewProb: string;
    barrierPrevDecay: string;
    barrierNewDecay: string;
    sifPrevProb: string;
    sifNewProb: string;
  } | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Selected node derived from state
  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  }, [nodes, selectedNodeId]);

  // Nodes connected to the selected node via the real backend edge list (not the
  // always-empty per-node `connections` field — see the edge-rendering fix above)
  const connectedNodes = useMemo(() => {
    if (!selectedNode) return [];
    const neighborIds = new Set<string>();
    edges.forEach((edge) => {
      const from = edge.from ?? edge.source;
      const to = edge.to ?? edge.target;
      if (from === selectedNode.id && to) neighborIds.add(to);
      else if (to === selectedNode.id && from) neighborIds.add(from);
    });
    return Array.from(neighborIds)
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is GraphNode => Boolean(n));
  }, [edges, nodes, selectedNode]);

  // Compute node coordinates based on layoutMode
  const layoutNodes = useMemo(() => {
    return nodes.map((n) => {
      if (layoutMode === 'causal') {
        // Causal sequence from Left to Right
        let cx = n.x;
        let cy = n.y;
        if (n.type === 'hazard' || n.type === 'human_factor') {
          cx = 140;
        } else if (n.type === 'barrier') {
          cx = 380;
        } else if (n.type === 'outcome') {
          cx = 640;
          cy = 240;
        } else if (n.type === 'asset') {
          cx = 820;
        }
        return { ...n, x: cx, y: cy };
      } else if (layoutMode === 'barrier') {
        // Barrier-centric Tree
        let bx = n.x;
        let by = n.y;
        if (n.type === 'barrier') {
          bx = 450;
          by = n.id === 'node-barrier-sniff' ? 140 : n.id === 'node-barrier-loto' ? 260 : 380;
        } else if (n.type === 'hazard' || n.type === 'human_factor') {
          bx = 180;
        } else if (n.type === 'outcome') {
          bx = 720;
          by = 260;
        }
        return { ...n, x: bx, y: by };
      }
      return n;
    });
  }, [nodes, layoutMode]);

  // Dynamic Barrier Restoration Simulation via FastAPI Backend
  const handleRestoreBarrier = async (nodeId: string) => {
    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    const isCurrentlyFailed = targetNode.status === 'failed';
    const action = isCurrentlyFailed ? 'restore' : 'degrade';

    try {
      const sim = await api.simulateKnowledgeGraphBarrier(nodeId, action);
      const newStatus = sim.newStatus as 'mitigating' | 'failed';

      setLastSimulationDelta({
        barrierName: sim.barrierName,
        action: sim.action,
        barrierPrevProb: sim.barrierPrevProb,
        barrierNewProb: sim.barrierNewProb,
        barrierPrevDecay: sim.barrierPrevDecay,
        barrierNewDecay: sim.barrierNewDecay,
        sifPrevProb: sim.sifPrevProb,
        sifNewProb: sim.sifNewProb
      });

      setNodes((prev) =>
        prev.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              status: newStatus,
              metrics: {
                ...n.metrics,
                failureProb: sim.barrierNewProb,
                decayScore: sim.barrierNewDecay
              }
            };
          }
          if (n.id === 'node-sif') {
            return {
              ...n,
              status: sim.sifNewStatus,
              metrics: {
                ...n.metrics,
                failureProb: sim.sifNewProb,
                decayScore: sim.sifNewDecay
              }
            };
          }
          return n;
        })
      );

      showToast(`Simulation: SIF risk recalculated to ${sim.sifNewProb}`);
    } catch (err: any) {
      showToast(`Simulation error: ${err.message}`);
    }
  };

  const filteredNodes = layoutNodes.filter((n) =>
    n.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    n.type.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="flex flex-col w-full gap-space-xl">
      {/* Backend Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-error-container/30 border border-error/50 flex items-center justify-between gap-3 text-on-surface">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error text-[20px]">error</span>
            <span className="font-body-md text-body-md text-error">{error}</span>
          </div>
          <button
            onClick={fetchGraph}
            className="px-3 py-1 rounded bg-error text-on-error font-label-code-sm text-label-code-sm flex items-center gap-1 hover:bg-error/90 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface-container-highest border border-primary/40 text-on-surface px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 font-label-code-sm text-label-code-sm">
          <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Header & Sub-Bar */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
              Knowledge Graph
            </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-0.5">
              How are the important entities and causes connected?
            </p>
        </div>

        {/* Graph Controls */}
        <div className="flex flex-wrap items-center gap-space-sm">
          {/* Layout Selector */}
          <div className="flex items-center bg-surface-container p-0.5 rounded border border-surface-container-high/40">
            {(['causal', 'barrier', 'force'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setLayoutMode(mode);
                  showToast(`Layout: ${mode === 'causal' ? 'cause to effect' : mode === 'barrier' ? 'barriers' : 'network'}`);
                }}
                className={`px-3 py-1 rounded font-label-code-sm text-label-code-sm transition-all ${
                  layoutMode === mode
                    ? 'bg-primary-container text-on-primary-container font-bold'
                    : 'text-outline hover:text-on-surface font-semibold'
                }`}
              >
                {mode === 'force' ? 'Network' : mode === 'causal' ? 'Cause to effect' : 'Barriers'}
              </button>
            ))}
          </div>

          {/* Zoom & Viewport controls */}
          <div className="flex items-center gap-1 bg-surface-container p-1 rounded border border-surface-container-high/40">
            <button
              onClick={() => setZoomLevel((z) => Math.min(Number((z + 0.15).toFixed(2)), 2.2))}
              className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
              title="Zoom In"
            >
              <span className="material-symbols-outlined text-[18px]">zoom_in</span>
            </button>
            <button
              onClick={handleResetView}
              className="px-2 py-0.5 font-label-code-sm text-label-code-sm text-outline hover:text-on-surface"
              title="Reset Zoom & Pan"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.max(Number((z - 0.15).toFixed(2)), 0.5))}
              className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
              title="Zoom Out"
            >
              <span className="material-symbols-outlined text-[18px]">zoom_out</span>
            </button>
            <div className="w-[1px] h-4 bg-outline-variant/40 mx-0.5" />
            <button
              onClick={handleResetView}
              className="px-2 py-1 rounded text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors flex items-center gap-1 font-label-code-sm text-label-code-sm"
              title="Reset View (Zoom 100% & Center Pan)"
            >
              <span className="material-symbols-outlined text-[16px]">restart_alt</span>
              <span>Reset view</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Split View: Interactive Graph Canvas + Inspector Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg">
        {/* Left 8 Cols: Graph Canvas */}
        <div className="xl:col-span-8 bg-surface-container-low rounded-xl p-space-lg shadow-md flex flex-col gap-space-md relative overflow-hidden border border-surface-container-high/40">
          {/* Canvas Filter Header */}
          <div className="flex items-center justify-between gap-space-sm flex-wrap">
            <div className="relative w-full sm:w-auto sm:min-w-[240px]">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">
                search
              </span>
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Find a node"
                className="bg-surface-container pl-8 pr-3 py-1.5 rounded text-on-surface font-label-code-sm text-label-code-sm focus:outline-none w-full border border-surface-container-high/40"
              />
            </div>

            <div className="flex items-center gap-space-md font-label-code-sm text-label-code-sm flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-error"></span> SIF Consequence
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Failed Barrier
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary"></span> Mitigating Action
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span> Asset / Unit
              </span>
            </div>
          </div>

          {/* SVG Graph Viewport */}
          <div className="relative w-full rounded-lg bg-surface-container-lowest overflow-hidden h-[380px] sm:h-[540px] flex items-center justify-center border border-surface-container-high/30 select-none">
            <svg
              className={`w-full h-full touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              viewBox="0 0 920 520"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
            >
              <defs>
                <linearGradient id="edgeGrad" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#ffb4ab" stopOpacity="0.8" />
                </linearGradient>
              </defs>

              {/* Grid Background */}
              <pattern height="40" id="graphGrid" patternUnits="userSpaceOnUse" width="40">
                <circle cx="2" cy="2" fill="#262a33" r="1" />
              </pattern>
              <rect fill="url(#graphGrid)" height="100%" width="100%" />

              {/* Main Pannable and Zoomable Group */}
              <g
                transform={`translate(${pan.x}, ${pan.y}) scale(${zoomLevel})`}
                style={{ transformOrigin: '460px 260px', transition: isDragging ? 'none' : 'transform 0.08s ease-out' }}
              >
                {/* Connecting Edges (drawn from the real backend edge list, not the
                    per-node `connections` field — that field is sourced from
                    node_metadata.connections, which is never populated, so it was
                    always empty and no lines were ever drawn) */}
                {edges.map((edge) => {
                  const source = layoutNodes.find((n) => n.id === (edge.from ?? edge.source));
                  const target = layoutNodes.find((n) => n.id === (edge.to ?? edge.target));
                  if (!source || !target) return null;
                  const isHighlighted = selectedNodeId === source.id || selectedNodeId === target.id;
                  return (
                    <g key={edge.id || `${source.id}-${target.id}`}>
                      <line
                        stroke={isHighlighted ? '#38bdf8' : '#31353e'}
                        strokeDasharray={source.type === 'human_factor' ? '4 4' : undefined}
                        strokeWidth={isHighlighted ? 2.5 : 1.2}
                        x1={source.x}
                        x2={target.x}
                        y1={source.y}
                        y2={target.y}
                      />
                    </g>
                  );
                })}

                {/* Nodes */}
                {filteredNodes.map((node) => {
                  const isSelected = selectedNodeId === node.id;
                  let fillColor = '#1c2028';
                  let strokeColor = '#38bdf8';
                  let radius = 22;

                  if (node.type === 'outcome') {
                    fillColor = node.status === 'nominal' ? '#064e3b' : '#93000a';
                    strokeColor = node.status === 'nominal' ? '#10b981' : '#ffb4ab';
                    radius = 32;
                  } else if (node.type === 'hazard') {
                    fillColor = '#4a1b24';
                    strokeColor = '#f43f5e';
                    radius = 24;
                  } else if (node.type === 'barrier') {
                    fillColor = node.status === 'failed' ? '#451a03' : '#064e3b';
                    strokeColor = node.status === 'failed' ? '#fbbf24' : '#10b981';
                    radius = 26;
                  } else if (node.type === 'human_factor') {
                    fillColor = '#1e293b';
                    strokeColor = '#94a3b8';
                    radius = 20;
                  } else if (node.type === 'asset') {
                    fillColor = '#311042';
                    strokeColor = '#c084fc';
                    radius = 24;
                  }

                  return (
                    <g
                      key={node.id}
                      data-node="true"
                      className="cursor-pointer group"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNodeId(node.id);
                      }}
                      transform={`translate(${node.x}, ${node.y})`}
                    >
                      <title>
                        {`${node.name} [${node.type}]\nFailure Prob: ${node.metrics?.failureProb ?? 'N/A'}\nIncidents: ${node.metrics?.incidentsCount ?? 'N/A'}\nDecay Score: ${node.metrics?.decayScore ?? 'N/A'}`}
                      </title>
                      {isSelected && (
                        <circle
                          cx="0"
                          cy="0"
                          fill="none"
                          r={radius + 8}
                          stroke="#38bdf8"
                          strokeDasharray="4 4"
                          strokeWidth="2"
                          className="animate-spin"
                          style={{ animationDuration: '10s' }}
                        />
                      )}
                      <circle
                        cx="0"
                        cy="0"
                        fill={fillColor}
                        r={radius}
                        stroke={strokeColor}
                        strokeWidth="2.5"
                        className="transition-transform group-hover:scale-110"
                      />
                      <text
                        className="select-none pointer-events-none"
                        fill="#ffffff"
                        fontFamily="Inter"
                        fontSize={radius > 26 ? '11' : '9'}
                        fontWeight="bold"
                        textAnchor="middle"
                        y="4"
                      >
                        {node.type === 'outcome' ? 'SIF' : node.type.toUpperCase().slice(0, 3)}
                      </text>
                      <text
                        fill="#dfe2ee"
                        fontFamily="Inter"
                        fontSize="10"
                        fontWeight="600"
                        textAnchor="middle"
                        y={radius + 14}
                        className="pointer-events-none drop-shadow-md"
                      >
                        {node.name.length > 20 ? `${node.name.slice(0, 18)}...` : node.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Panning & Zoom Status Badge */}
            <div className="absolute bottom-3 right-3 bg-surface-container-highest/80 backdrop-blur px-2.5 py-1 rounded text-[11px] font-mono text-on-surface-variant flex items-center gap-2 pointer-events-none border border-surface-container-high/40">
              <span className="material-symbols-outlined text-[14px] text-primary">pan_tool</span>
              <span>Drag canvas to pan • Scroll to zoom</span>
              {(pan.x !== 0 || pan.y !== 0 || zoomLevel !== 1) && (
                <span className="text-primary font-semibold">({Math.round(zoomLevel * 100)}% | {pan.x}px, {pan.y}px)</span>
              )}
            </div>

            {/* Canvas Bottom Stats */}
            <div className="absolute bottom-3 left-3 bg-surface-container/80 backdrop-blur-md px-3 py-1.5 rounded font-label-code-sm text-label-code-sm text-outline border border-surface-container-high/40 flex items-center gap-3">
              <span>Nodes: {nodes.length} Active</span>
              <span>•</span>
              <span>Edges: {edges.length} Causal Vectors</span>
              <span>•</span>
              <span className="text-primary font-semibold">
                Graph Density: {nodes.length > 1 ? ((2 * edges.length) / (nodes.length * (nodes.length - 1))).toFixed(2) : '0.00'}
              </span>
            </div>
          </div>
        </div>

        {/* Right 4 Cols: Inspector Panel */}
        <div className="xl:col-span-4 bg-surface-container-low rounded-xl p-space-lg shadow-md flex flex-col gap-space-md border border-surface-container-high/40">
          {!selectedNode ? (
            <div className="p-8 text-center text-outline font-label-code-sm flex flex-col items-center justify-center gap-2 min-h-[300px]">
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-primary text-[28px]">progress_activity</span>
                  <span>Loading graph…</span>
                </>
              ) : (
                <span>No node selected</span>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between pb-space-xs border-b border-surface-container-high/30">
                <span className="font-label-code-sm text-label-code-sm text-outline uppercase tracking-wide font-semibold">
                  Selected node
                </span>
                <span className="px-2 py-0.5 rounded font-label-code-sm text-label-code-sm uppercase font-bold bg-surface-container text-primary">
                  {selectedNode.type}
                </span>
              </div>

          {/* Node Hero */}
          <div className="flex flex-col gap-1">
            <h3 className="font-headline-md text-headline-md text-on-surface font-bold">
              {selectedNode.name}
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              {selectedNode.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                const params = new URLSearchParams({ node: selectedNode.name, nodeDesc: selectedNode.description || '' });
                navigate(`/report-analyzer?${params.toString()}`);
              }}
              className="flex-1 py-1.5 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-code-sm text-label-code-sm text-center transition-colors border border-surface-container-high/40"
            >
              Analyze in Report Analyzer
            </button>
            <button
              onClick={async () => {
                try {
                  await api.createIntervention({
                    title: `CAPA — ${selectedNode.name}`,
                    description: selectedNode.description || `Intervention initiated from Knowledge Graph node ${selectedNode.name}.`,
                    targetedVector: selectedNode.type,
                    priority: selectedNode.status === 'failed' ? 'Critical' : 'Moderate',
                    status: 'Proposed',
                    owner: '',
                    ownerRole: null,
                    dueDate: null,
                    progressPct: 0
                  });
                  showToast(`CAPA created for ${selectedNode.name}. Saved.`);
                  navigate('/interventions');
                } catch (err: any) {
                  showToast(`Error initiating CAPA: ${err?.message || 'Unknown error'}`);
                }
              }}
              className="flex-1 py-1.5 rounded bg-primary-container text-on-primary-container hover:bg-primary font-label-code-sm text-label-code-sm font-semibold text-center transition-colors"
            >
              Deploy CAPA
            </button>
          </div>

          {/* Telemetry Metrics */}
          <div className="grid grid-cols-3 gap-2 p-space-md rounded-lg bg-surface-container-lowest border border-surface-container-high/30">
            <div className="flex flex-col">
              <span className="font-label-code-sm text-[10px] text-outline uppercase">Failure probability</span>
              <span className={`font-label-code-md text-label-code-md font-bold ${
                parseFloat(selectedNode.metrics.failureProb) > 50 ? 'text-error' : 'text-primary'
              }`}>
                {selectedNode.metrics.failureProb}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-code-sm text-[10px] text-outline uppercase">Incidents</span>
              <span className="font-label-code-md text-label-code-md text-on-surface font-bold">
                {selectedNode.metrics.incidentsCount}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-code-sm text-[10px] text-outline uppercase">Health</span>
              <span className="font-label-code-md text-label-code-md text-primary font-bold break-words">
                {selectedNode.metrics.decayScore}
              </span>
            </div>
          </div>

          {/* Live Simulation Delta Card */}
          {lastSimulationDelta && (
            <div className="p-space-sm rounded-lg bg-surface-container border-l-2 border-primary flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between font-semibold">
                <span className="text-primary font-label-code-sm text-[11px] uppercase">
                  Simulation result
                </span>
                <span className="text-outline font-label-code-sm text-[10px]">Deterministic Heuristic</span>
              </div>
              <div className="flex items-center justify-between text-on-surface-variant font-mono">
                <span>{lastSimulationDelta.barrierName}:</span>
                <span className="text-on-surface font-bold">
                  {lastSimulationDelta.barrierPrevProb} &rarr; {lastSimulationDelta.barrierNewProb}
                </span>
              </div>
              <div className="flex items-center justify-between text-on-surface-variant font-mono">
                <span>Downstream SIF Knot:</span>
                <span className="text-error font-bold">
                  {lastSimulationDelta.sifPrevProb} &rarr; {lastSimulationDelta.sifNewProb}
                </span>
              </div>
            </div>
          )}

          {/* Upstream / Downstream Relationships */}
          <div className="flex flex-col gap-space-xs">
            <span className="font-label-code-sm text-label-code-sm text-outline uppercase tracking-wide font-semibold">
              Connected entities
            </span>
            <div className="space-y-1.5">
              {connectedNodes.map((target) => {
                return (
                  <div
                    key={target.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedNodeId(target.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedNodeId(target.id);
                      }
                    }}
                    className="p-space-sm rounded bg-surface-container hover:bg-surface-container-high transition-colors flex items-start justify-between gap-2 cursor-pointer border border-surface-container-high/30"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="material-symbols-outlined text-[16px] text-primary shrink-0">
                        chevron_right
                      </span>
                      <span className="font-body-sm text-body-sm text-on-surface break-words">
                        {target.name}
                      </span>
                    </div>
                    <span className="font-label-code-sm text-[10px] uppercase text-outline px-1.5 py-0.5 rounded bg-surface-container-high shrink-0">
                      {target.type}
                    </span>
                  </div>
                );
              })}
              {connectedNodes.length === 0 && (
                <p className="font-body-sm text-body-sm text-outline italic p-space-sm">
                  No linked entities found in the current topology.
                </p>
              )}
            </div>
          </div>

          {/* Interactive Simulation Action */}
          {selectedNode.type === 'barrier' && (
            <div className="p-space-md rounded-lg bg-surface-container flex flex-col gap-2 mt-auto border border-surface-container-high/40">
              <div className="flex items-center justify-between">
                <span className="font-label-code-sm text-label-code-sm text-on-surface font-semibold">
                  What-if: barrier health
                </span>
                <span className={`font-label-code-sm text-label-code-sm font-bold uppercase ${selectedNode.status === 'mitigating' ? 'text-primary' : 'text-error'}`}>
                  {selectedNode.status === 'mitigating' ? 'Verified Intact' : 'Circumvention Detected'}
                </span>
              </div>
              <p className="font-body-sm text-[12px] text-on-surface-variant">
                Switch this barrier between failed and intact to see the effect on overall SIF probability.
              </p>
              <button
                onClick={() => handleRestoreBarrier(selectedNode.id)}
                className={`py-2 px-space-md rounded font-headline-sm text-headline-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  selectedNode.status === 'failed'
                    ? 'bg-primary hover:bg-primary-container text-on-primary shadow-md'
                    : 'bg-surface-container-high hover:bg-surface-bright text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {selectedNode.status === 'failed' ? 'build_circle' : 'undo'}
                </span>
                <span>
                  {selectedNode.status === 'failed' ? 'Simulate restoring this barrier' : 'Reset to failed state'}
                </span>
              </button>
            </div>
          )}

          </>
          )}
        </div>
      </div>
    </div>
  );
};
