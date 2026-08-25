import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import cytoscape from 'cytoscape';
import type { Core, EventObject } from 'cytoscape';
import {
  ExternalLink,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { CommunityGraphResponse, GraphEdge, GraphNode } from '../../types/api';

interface NetworkGraphProps {
  graphData: CommunityGraphResponse;
  height?: string | number;
}

export const NetworkGraph: React.FC<NetworkGraphProps> = ({
  graphData,
  height = '520px',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const navigate = useNavigate();

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [layoutName, setLayoutName] = useState<'cose' | 'concentric' | 'circle'>('cose');

  useEffect(() => {
    if (!containerRef.current) return;

    // Build Cytoscape elements
    const elements: cytoscape.ElementDefinition[] = [];

    // Add nodes
    graphData.nodes.forEach((node) => {
      // Calculate node size based on degree
      const size = Math.min(48, Math.max(16, 16 + node.degree * 2));
      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          label: node.id,
          customer_name: node.customer_name || node.id,
          balance: node.balance,
          degree: node.degree,
          size,
        },
      });
    });

    // Add edges
    graphData.edges.forEach((edge, idx) => {
      elements.push({
        group: 'edges',
        data: {
          id: `e_${edge.source}_${edge.target}_${idx}`,
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
          shared_instruments: edge.shared_instruments,
          shared_devices: edge.shared_devices,
          shared_ips: edge.shared_ips,
          shared_merchants: edge.shared_merchants,
          temporal_overlap: edge.temporal_overlap,
        },
      });
    });

    // Initialize Cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#0284c7',
            'border-width': 2,
            'border-color': '#38bdf8',
            'label': 'data(label)',
            'color': '#cbd5e1',
            'font-size': '10px',
            'font-family': 'JetBrains Mono, monospace',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'width': 'data(size)',
            'height': 'data(size)',
            'transition-property': 'background-color, border-color, width, height',
            'transition-duration': 0.15,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'background-color': '#f59e0b',
            'border-color': '#fbbf24',
            'border-width': 3,
            'color': '#fef08a',
            'font-weight': 'bold',
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'background-color': '#ef4444',
            'border-color': '#fca5a5',
            'border-width': 3,
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 'mapData(weight, 1, 15, 1, 6)',
            'line-color': '#334155',
            'curve-style': 'bezier',
            'opacity': 0.6,
            'transition-property': 'line-color, opacity, width',
            'transition-duration': 0.15,
          },
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#f59e0b',
            'opacity': 1,
            'width': 3,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            'line-color': '#38bdf8',
            'opacity': 0.9,
          },
        },
      ],
      layout: {
        name: layoutName,
        animate: false,
        padding: 40,
      },
      minZoom: 0.2,
      maxZoom: 3.5,
    });

    // Event: Node Click
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target;
      const id = node.id();
      const match = graphData.nodes.find((n) => n.id === id);
      if (match) {
        setSelectedNode(match);
        setSelectedEdge(null);
      }
    });

    // Event: Edge Click
    cy.on('tap', 'edge', (evt: EventObject) => {
      const edge = evt.target;
      const data = edge.data();
      setSelectedEdge({
        source: data.source,
        target: data.target,
        weight: data.weight,
        shared_instruments: data.shared_instruments || [],
        shared_devices: data.shared_devices || [],
        shared_ips: data.shared_ips || [],
        shared_merchants: data.shared_merchants || [],
        temporal_overlap: data.temporal_overlap || 0,
      });
      setSelectedNode(null);
    });

    // Event: Background Click
    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [graphData, layoutName]);

  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.25);
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.8);
    }
  };

  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 30);
    }
  };

  return (
    <div
      className="dash-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}
    >
      {/* Graph Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: '#0b1120',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
            Network Topology
          </span>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: '#1e293b',
              color: 'var(--text-muted)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {graphData.nodes.length} nodes · {graphData.edges.length} edges
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Layout Selector */}
          <select
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value as any)}
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              outline: 'none',
            }}
          >
            <option value="cose">Force-Directed (Cose)</option>
            <option value="concentric">Concentric (Degree)</option>
            <option value="circle">Circular</option>
          </select>

          <button
            onClick={handleZoomIn}
            title="Zoom In"
            style={{
              padding: '4px 8px',
              backgroundColor: '#1e293b',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            style={{
              padding: '4px 8px',
              backgroundColor: '#1e293b',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={handleFit}
            title="Fit to Screen"
            style={{
              padding: '4px 8px',
              backgroundColor: '#1e293b',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Graph Canvas Container */}
      <div style={{ position: 'relative', width: '100%', height }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%', backgroundColor: '#070b12' }} />

        {/* Legend Overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(4px)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#38bdf8' }} />
            <span>Node size = Connection Degree</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '2px', backgroundColor: '#64748b' }} />
            <span>Edge thickness = Evidence Weight</span>
          </div>
        </div>

        {/* Selected Node Details Side-Card */}
        {selectedNode && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              width: '280px',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border-focus)',
              borderRadius: '6px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-cyan)', textTransform: 'uppercase' }}>
                Selected Account
              </span>
              <button
                onClick={() => setSelectedNode(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                {selectedNode.id}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {selectedNode.customer_name}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
              <div>
                <span style={{ color: 'var(--text-dim)', display: 'block' }}>Degree:</span>
                <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                  {selectedNode.degree} connections
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', display: 'block' }}>Balance:</span>
                <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                  ${selectedNode.balance?.toLocaleString() || '0.00'}
                </span>
              </div>
            </div>

            <button
              onClick={() => navigate(`/accounts/${selectedNode.id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '7px 12px',
                backgroundColor: '#0284c7',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '4px',
              }}
            >
              Open Account Profile
              <ExternalLink size={13} />
            </button>
          </div>
        )}

        {/* Selected Edge Details Side-Card */}
        {selectedEdge && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              width: '320px',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border-light)',
              borderRadius: '6px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase' }}>
                Evidence Link
              </span>
              <button
                onClick={() => setSelectedEdge(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--text-main)' }}>{selectedEdge.source}</span>
              <span style={{ color: 'var(--text-dim)' }}>⇄</span>
              <span style={{ color: 'var(--text-main)' }}>{selectedEdge.target}</span>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Total Evidence Weight:</span>
              <span className="font-mono font-bold" style={{ color: '#f59e0b' }}>
                {selectedEdge.weight.toFixed(2)}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
              {selectedEdge.shared_instruments.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Shared Payment Instruments ({selectedEdge.shared_instruments.length}):</span>
                  <div className="font-mono" style={{ color: '#fbbf24', fontSize: '10px' }}>
                    {selectedEdge.shared_instruments.join(', ')}
                  </div>
                </div>
              )}
              {selectedEdge.shared_devices.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Shared Devices ({selectedEdge.shared_devices.length}):</span>
                  <div className="font-mono" style={{ color: '#f87171', fontSize: '10px' }}>
                    {selectedEdge.shared_devices.join(', ')}
                  </div>
                </div>
              )}
              {selectedEdge.shared_ips.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Shared IPs ({selectedEdge.shared_ips.length}):</span>
                  <div className="font-mono" style={{ color: '#c084fc', fontSize: '10px' }}>
                    {selectedEdge.shared_ips.join(', ')}
                  </div>
                </div>
              )}
              {selectedEdge.shared_merchants.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Shared Merchants ({selectedEdge.shared_merchants.length}):</span>
                  <div className="font-mono" style={{ color: '#94a3b8', fontSize: '10px' }}>
                    {selectedEdge.shared_merchants.join(', ')}
                  </div>
                </div>
              )}
              {selectedEdge.temporal_overlap > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Same-Day Temporal Overlap:</span>
                  <span className="font-mono font-semibold" style={{ color: '#38bdf8' }}>
                    {selectedEdge.temporal_overlap} days
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
