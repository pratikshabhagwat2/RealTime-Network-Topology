// TopologyGraph.jsx
import React, { useEffect, useRef, useState } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import axios from 'axios';
cytoscape.use(dagre); // Only needed if you use 'dagre' layout as fallback
const iconMap = {
  router: '/icons/router.png',
  pod: '/icons/pod.png',
  site: '/icons/site.png',
  radius: '/icons/radius.png',
  cp: '/icons/pod.png'
};
const TopologyGraph = () => {
  const cyRef = useRef(null);
  const [elements, setElements] = useState([]);
  const [rawData, setRawData] = useState({ nodes: [], edges: [], device_roles: {} });
  const [excludedTypes, setExcludedTypes] = useState(new Set());
  const [nodeTypes, setNodeTypes] = useState([]);
  const [currentLayout, setCurrentLayout] = useState('concentric');
  const [deviceRoles, setDeviceRoles] = useState({});
  const [showOnlyInactiveConnections, setShowOnlyInactiveConnections] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showTroubleshootModal, setShowTroubleshootModal] = useState(false);
  
  // Polling function
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('/static/topology.json');
        setRawData(res.data);
        if (res.data.device_roles) {
          setDeviceRoles(res.data.device_roles);
        }
      } catch (err) {
        console.error('Failed to fetch topology:', err);
      }
    };
    fetchData(); // Initial load
    const interval = setInterval(fetchData, 10000); // Every 10s
    return () => clearInterval(interval);
  }, []);
  // Filter and set Cytoscape elements
  useEffect(() => {
    const filteredNodes = rawData.nodes.filter(n => !excludedTypes.has(n.type));
    const allowedIds = new Set(filteredNodes.map(n => n.id));
    
    let filteredEdges = rawData.edges.filter(
      e => allowedIds.has(e.source) && allowedIds.has(e.target)
    );
    
    // Apply inactive connections filter
    if (showOnlyInactiveConnections) {
      filteredEdges = filteredEdges.filter(e => 
        e.state === 'inactive' || e.state === 'down'
      );
      
      // Also filter nodes to only show those with inactive connections
      const nodesWithInactiveConnections = new Set();
      filteredEdges.forEach(edge => {
        nodesWithInactiveConnections.add(edge.source);
        nodesWithInactiveConnections.add(edge.target);
      });
      
      // Update filteredNodes to only include nodes with inactive connections
      filteredNodes.splice(0, filteredNodes.length, ...filteredNodes.filter(n => 
        nodesWithInactiveConnections.has(n.id)
      ));
    }
    const cyNodes = filteredNodes.map(node => {
      const baseStyle = {
        width: 40,
        height: 40,
        label: node.label,
        fontSize: 9,
        textValign: 'bottom',
        textHalign: 'center',
        color: '#000',
        textOutlineWidth: 2,
        textOutlineColor: '#fff'
      };
      const style = iconMap[node.type]
        ? {
            ...baseStyle,
            backgroundFit: 'none',
            backgroundImage: iconMap[node.type],
            backgroundColor: '#EEDC82',
            shape: 'ellipse',
            borderWidth: 2,
            borderColor: '#000',
            backgroundWidth: '60%',   // Icon covers 70% of node width
            backgroundHeight: '60%',  // Icon covers 70% of node height
            backgroundPosition: '50% 50%' // Center the icon
          }
        : {
            ...baseStyle,
            backgroundColor: '#EEDC82',
            shape: 'ellipse',
            borderColor: '#000', // <-- Set node border color to black
            borderWidth: 2
          };
      return {
        data: { 
          id: node.id, 
          label: node.label, 
          type: node.type,
          upf_sub_count: node.upf_sub_count,
          metadata: node.metadata || {} // <-- Add this line
        },
        style
      };
    });
    const cyEdges = filteredEdges.map(edge => {
      // Find source and target nodes for role-based classification
      const sourceNode = filteredNodes.find(n => n.id === edge.source);
      const targetNode = filteredNodes.find(n => n.id === edge.target);
      
      return {
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          state: edge.state,
          metadata: edge.metadata || {}
        },
        classes: getEdgeClassification(edge, sourceNode, targetNode)
      };
    });
    setElements([...cyNodes, ...cyEdges]);
    // Update available node types for filter UI
    const types = new Set(rawData.nodes.map(n => n.type));
    setNodeTypes(Array.from(types));
  }, [rawData, excludedTypes, deviceRoles, showOnlyInactiveConnections]);
  // Setup Tippy.js tooltips after elements are set
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.ready(() => {
      // Node tooltips (UPDATED)
      cy.nodes().forEach(node => {
        const metadata = node.data('metadata') || {};
        const upfSubCount = node.data('upf_sub_count'); // Retrieve upf_sub_count
        const metadataHtml = Object.entries(metadata)
          .filter(([k, v]) => v !== null && v !== undefined && v !== 'None' && v !== '<none>')
          .map(([k, v]) => `<div><strong>${k.replace(/_/g, ' ')}:</strong> ${v}</div>`)
          .join('');
        const upfSubCountHtml = upfSubCount !== undefined ? `<div><strong>UPF Sub Count:</strong> ${upfSubCount}</div>` : '';
        const content = `
          <div style="padding: 4px">
            <strong>Node: ${node.data('label') || node.data('id')}</strong>
            ${metadataHtml || upfSubCountHtml ? `<hr style="margin:4px 0"/>` : ''}
            ${metadataHtml}
            ${upfSubCountHtml}
          </div>
        `;
        const tip = tippy(document.createElement('div'), {
          content,
          allowHTML: true,
          trigger: 'manual',
          placement: 'top',
          appendTo: document.body,
          interactive: false,
          hideOnClick: false,
          offset: [0, 10] // Add some spacing from the node
        });
        const virtualRef = {
          getBoundingClientRect: () => {
            const pos = node.renderedPosition();
            const containerRect = cyRef.current.container().getBoundingClientRect();
            
            // Calculate dynamic positioning to avoid overlap
            const nodeWidth = 40; // Node width from your baseStyle
            const nodeHeight = 40; // Node height from your baseStyle
            
            return {
              width: nodeWidth,
              height: nodeHeight,
              top: containerRect.top + pos.y - nodeHeight/2,
              left: containerRect.left + pos.x - nodeWidth/2,
              right: containerRect.left + pos.x + nodeWidth/2,
              bottom: containerRect.top + pos.y + nodeHeight/2
            };
          },
          clientWidth: 0,
          clientHeight: 0
        };
        node.on('mouseover', () => {
          tip.setProps({ getReferenceClientRect: virtualRef.getBoundingClientRect });
          tip.show();
        });
        node.on('mouseout', () => tip.hide());
        
        // Add click handler for troubleshooting
        node.on('tap', () => {
          const nodeData = {
            id: node.data('id'),
            label: node.data('label'),
            type: node.data('type'),
            metadata: node.data('metadata') || {},
            upf_sub_count: node.data('upf_sub_count')
          };
          setSelectedNode(nodeData);
          setShowTroubleshootModal(true);
        });
      });

      // Edge tooltips (UPDATED)
      cy.edges().forEach(edge => {
        const metadata = edge.data('metadata') || {};
        const upfSubCount = edge.data('upf_sub_count'); // Retrieve upf_sub_count
        const metadataHtml = Object.entries(metadata)
          .filter(([k, v]) => v !== null && v !== undefined && v !== 'None' && v !== '<none>')
          .map(([k, v]) => `<div><strong>${k.replace(/_/g, ' ')}:</strong> ${v}</div>`)
          .join('');
        const upfSubCountHtml = upfSubCount !== undefined ? `<div><strong>UPF Sub Count:</strong> ${upfSubCount}</div>` : '';
        const content = `
          <div style="padding: 4px">
            <strong>Edge: ${edge.data('label') || `${edge.data('source')} → ${edge.data('target')}`}</strong>
            ${metadataHtml || upfSubCountHtml ? `<hr style="margin:4px 0"/>` : ''}
            ${metadataHtml}
            ${upfSubCountHtml}
          </div>
        `;
        const tip = tippy(document.createElement('div'), {
          content,
          allowHTML: true,
          trigger: 'manual',
          placement: 'top',
          appendTo: document.body,
          interactive: false,
          hideOnClick: false,
          offset: [0, 10] // Add some spacing from the edge
        });
        const virtualRef = {
          getBoundingClientRect: () => {
            const pos = edge.midpoint();
            const containerRect = cyRef.current.container().getBoundingClientRect();
            
            return {
              width: 2, // Edge width
              height: 2, // Edge height
              top: containerRect.top + pos.y - 1,
              left: containerRect.left + pos.x - 1,
              right: containerRect.left + pos.x + 1,
              bottom: containerRect.top + pos.y + 1
            };
          },
          clientWidth: 0,
          clientHeight: 0
        };
        edge.on('mouseover', () => {
          tip.setProps({ getReferenceClientRect: virtualRef.getBoundingClientRect });
          tip.show();
        });
        edge.on('mouseout', () => tip.hide());
      });
    });
  }, [elements]);
  // Filtering logic
  const toggleFilter = type => {
    const newSet = new Set(excludedTypes);
    newSet.has(type) ? newSet.delete(type) : newSet.add(type);
    setExcludedTypes(newSet);
  };
  // Layout calculation function
  const getLayoutConfig = () => {
    if (currentLayout === 'custom') {
      // Custom hierarchical layout: radius at top, cp in middle, upf/router at bottom
      const nodePositions = {};
      const filteredNodes = rawData.nodes.filter(n => !excludedTypes.has(n.type));
      
      // Group nodes by type
      const nodesByType = {
        radius: [],
        cp: [],
        upf: [],
        router: [],
        site: []
      };
      
      filteredNodes.forEach(node => {
        if (nodesByType[node.type]) {
          nodesByType[node.type].push(node);
        } else {
          nodesByType.site.push(node); // Default to site if type unknown
        }
      });
      
      // Calculate positions for each layer
      const containerWidth = 800; // Approximate container width
      const layerHeight = 150; // Height between layers
      
      // Top layer: radius nodes
      nodesByType.radius.forEach((node, i) => {
        const x = (containerWidth / (nodesByType.radius.length + 1)) * (i + 1);
        nodePositions[node.id] = { x, y: 50 };
      });
      
      // Middle layer: cp nodes
      nodesByType.cp.forEach((node, i) => {
        const x = (containerWidth / (nodesByType.cp.length + 1)) * (i + 1);
        nodePositions[node.id] = { x, y: 50 + layerHeight };
      });
      
      // Bottom layer: upf and router nodes
      const bottomNodes = [...nodesByType.upf, ...nodesByType.router];
      bottomNodes.forEach((node, i) => {
        const x = (containerWidth / (bottomNodes.length + 1)) * (i + 1);
        nodePositions[node.id] = { x, y: 50 + 2 * layerHeight };
      });
      
      // Site nodes: distribute around the middle
      nodesByType.site.forEach((node, i) => {
        const x = (containerWidth / (nodesByType.site.length + 1)) * (i + 1);
        nodePositions[node.id] = { x, y: 50 + layerHeight * 1.5 };
      });
      
      return {
        name: 'preset',
        positions: nodePositions,
        fit: true,
        padding: 30,
        animate: true
      };
    } else {
      // Default concentric layout
      return {
        name: 'concentric',
        concentric: node => (node.data('type') === 'cp' ? 100 : 50),
        levelWidth: () => 10,
        padding: 30,
        minNodeSpacing: 50,
        avoidOverlap: true,
        animate: true,
        fit: true
      };
    }
  };
  // Handle layout change
  const handleLayoutChange = (newLayout) => {
    setCurrentLayout(newLayout);
    // Apply new layout to existing cytoscape instance
    if (cyRef.current) {
      cyRef.current.layout(getLayoutConfig()).run();
    }
  };
  
  // Troubleshooting functions
  const getTroubleshootingSteps = (node) => {
    const nodeType = node.type;
    const metadata = node.metadata || {};
    
    // Check if node has connection issues
    const hasConnectionIssues = rawData.edges.some(edge => 
      (edge.source === node.id || edge.target === node.id) && 
      (edge.state === 'down' || edge.state === 'inactive')
    );
    
    const baseSteps = [
      `Check physical connectivity to ${node.label}`,
      `Verify ${node.label} is powered on and operational`,
      `Check network interface status on ${node.label}`,
      `Review logs for ${node.label} for error messages`
    ];
    
    const typeSpecificSteps = {
      cp: [
        'Verify control plane services are running',
        'Check subscriber session counts',
        'Validate routing table entries',
        'Check BGP neighbor status',
        'Verify RADIUS connectivity'
      ],
      router: [
        'Check routing protocols (BGP, OSPF)',
        'Verify interface configurations',
        'Check for packet loss or high latency',
        'Validate forwarding table entries'
      ],
      radius: [
        'Check RADIUS service status',
        'Verify authentication database connectivity',
        'Check accounting log rotation',
        'Validate shared secret configuration'
      ],
      site: [
        'Check site-to-site VPN connectivity',
        'Verify DNS resolution',
        'Check firewall rules',
        'Validate routing to remote networks'
      ]
    };
    
    return {
      hasIssues: hasConnectionIssues,
      steps: [...baseSteps, ...(typeSpecificSteps[nodeType] || [])]
    };
  };
  
  const executeTroubleshootingAction = async (action, node) => {
    console.log(`Executing: ${action} for node ${node.label}`);
    
    const actions = {
      'ping': `ping -c 4 ${node.metadata?.device_ip || node.id}`,
      'traceroute': `traceroute ${node.metadata?.device_ip || node.id}`,
      'restart_services': `systemctl restart network-services`,
      'check_logs': `tail -f /var/log/network.log`,
      'reset_connection': `ifdown eth0 && ifup eth0`
    };
    
    if (actions[action]) {
      alert(`Would execute: ${actions[action]}\n\nResult: Action completed successfully (simulated)`);
    }
  };
  
  // Function to determine edge classification based on device roles and gr_instance
  const getEdgeClassification = (edge, sourceNode, targetNode) => {
    // First check if the connection state is down/inactive - override role-based logic
    if (edge.state === 'inactive' || edge.state === 'down') {
      return 'edge-inactive'; // Red dashed line regardless of device roles
    }
    
    // Only apply role-based logic if the connection is active/up
    if (edge.state === 'active' || edge.state === 'up' || edge.state === 'establ' || edge.state === 'node_active') {
      // For non-CP to CP edges, use role-based logic
      if (sourceNode && targetNode && sourceNode.type !== 'cp' && targetNode.type === 'cp') {
        const gr_instance = sourceNode.metadata?.gr_instance;
        if (gr_instance && deviceRoles[targetNode.id]) {
          const instanceKey = `instance_${gr_instance}`;
          const role = deviceRoles[targetNode.id][instanceKey];
          
          if (role === 'primary') {
            return 'edge-primary';  // Green thick line for primary
          } else if (role === 'standby') {
            return 'edge-standby';  // Yellow thick dashed line for standby
          }
        }
      }
      
      // For CP to non-CP edges (reverse direction), use same logic
      if (sourceNode && targetNode && sourceNode.type === 'cp' && targetNode.type !== 'cp') {
        const gr_instance = targetNode.metadata?.gr_instance;
        if (gr_instance && deviceRoles[sourceNode.id]) {
          const instanceKey = `instance_${gr_instance}`;
          const role = deviceRoles[sourceNode.id][instanceKey];
          
          if (role === 'primary') {
            return 'edge-primary';  // Green thick line for primary
          } else if (role === 'standby') {
            return 'edge-standby';  // Yellow thick dashed line for standby
          }
        }
      }
      
      // If role-based logic doesn't apply but state is active, use standard active style
      return 'edge-active';
    }
    
    // Default case for unknown states
    return 'edge-default';
  };
  return (
    <div>
      {/* Filter UI */}
      <div style={{ padding: 10, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <strong>Hide Node Types:</strong>
          {nodeTypes.map(type => (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              style={{
                marginLeft: 10,
                padding: '5px 10px',
                backgroundColor: excludedTypes.has(type) ? '#dc3545' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: 4
              }}
            >
              {type}
            </button>
          ))}
          <button
            onClick={() => setExcludedTypes(new Set())}
            style={{
              marginLeft: 20,
              padding: '5px 10px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: 4
            }}
          >
            Reset Filters
          </button>
          
          {/* Inactive Connections Filter */}
          <button
            onClick={() => setShowOnlyInactiveConnections(!showOnlyInactiveConnections)}
            style={{
              marginLeft: 20,
              padding: '5px 10px',
              backgroundColor: showOnlyInactiveConnections ? '#dc3545' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontWeight: showOnlyInactiveConnections ? 'bold' : 'normal'
            }}
          >
            {showOnlyInactiveConnections ? '🔴 Showing Only Inactive' : '📡 Show Only Inactive'}
          </button>
        </div>
        
        {/* Layout Selector */}
        <div style={{ marginLeft: 'auto' }}>
          <strong>Layout:</strong>
          <select
            value={currentLayout}
            onChange={(e) => handleLayoutChange(e.target.value)}
            style={{
              marginLeft: 10,
              padding: '5px 10px',
              borderRadius: 4,
              border: '1px solid #ccc'
            }}
          >
            <option value="concentric">Concentric</option>
            <option value="custom">Hierarchical</option>
          </select>
        </div>
      </div>
      {/* Graph */}
      <CytoscapeComponent
        cy={cy => (cyRef.current = cy)}
        elements={elements}
        style={{ width: '100%', height: '70vh', backgroundColor: '#232323' }}
        layout={getLayoutConfig()}
        stylesheet={[
          {
            selector: 'node',
            style: {
              label: 'data(label)',
              textValign: 'bottom',
              textHalign: 'center',
              fontSize: 9,
              color: '#000',
              textOutlineWidth: 2,
              textOutlineColor: '#ffffff'
            }
          },
          {
            selector: '.edge-active',
            style: {
              width: 1,
              lineColor: '#28a745',
              curveStyle: 'bezier',
              label: 'data(label)',
              fontSize: 10,
              color: '#155724', // Different color for edge label (dark green)
              textOutlineWidth: 2,
              textOutlineColor: '#e6ffe6'
            }
          },
          {
            selector: '.edge-inactive',
            style: {
              width: 1,
              lineStyle: 'dashed',
              lineColor: '#dc3545',
              curveStyle: 'bezier',
              label: 'data(label)',
              fontSize: 10,
              color: '#721c24', // Different color for edge label (dark red)
              textOutlineWidth: 2,
              textOutlineColor: '#ffe6e6'
            }
          },
          {
            selector: '.edge-default',
            style: {
              width: 1,
              lineColor: '#6c757d',
              curveStyle: 'bezier',
              label: 'data(label)',
              fontSize: 10,
              color: '#343a40', // Different color for edge label (dark gray)
              textOutlineWidth: 2,
              textOutlineColor: '#e9ecef'
            }
          },
          {
            selector: '.edge-primary',
            style: {
              width: 2, // Same width as standby for consistency
              lineColor: '#28a745', // Green for primary/active device
              curveStyle: 'bezier',
              label: 'data(label)',
              fontSize: 10,
              color: '#155724', // Dark green for edge label
              textOutlineWidth: 2,
              textOutlineColor: '#e6ffe6'
            }
          },
          {
            selector: '.edge-standby',
            style: {
              width: 2,
              lineStyle: 'dashed',
              lineColor: '#ffc107', // Yellow for standby device
              curveStyle: 'bezier',
              label: 'data(label)',
              fontSize: 10,
              color: '#856404', // Dark yellow for edge label
              textOutlineWidth: 2,
              textOutlineColor: '#fff3cd'
            }
          }
        ]}
      />
      {/* Legend Table */}
      <div style={{ padding: 8, backgroundColor: '#f8f9fa', borderRadius: 5, margin: '8px 10px' }}>
        <strong>Visual Status Guide:</strong>
        <table style={{ marginTop: 8, borderCollapse: 'collapse', width: '100%', maxWidth: 600, fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: '#e9ecef' }}>
              <th style={{ border: '1px solid #dee2e6', padding: 6, textAlign: 'left' }}>Line Style</th>
              <th style={{ border: '1px solid #dee2e6', padding: 6, textAlign: 'left' }}>Color</th>
              <th style={{ border: '1px solid #dee2e6', padding: 6, textAlign: 'left' }}>Status</th>
              <th style={{ border: '1px solid #dee2e6', padding: 6, textAlign: 'left' }}>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>
                <div style={{ width: 30, height: 2, backgroundColor: '#155724', borderRadius: 1 }}></div>
              </td>
              <td style={{ border: '1px solid #dee2e6', padding: 6, color: '#155724', fontWeight: 'bold' }}>Green</td>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>Active/Up/Established</td>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>Standard active connection</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>
                <div style={{ 
                  width: 30, 
                  height: 3, 
                  backgroundColor: '#721c24',
                  borderRadius: 1,
                  backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, #fff 2px, #fff 4px)'
                }}></div>
              </td>
              <td style={{ border: '1px solid #dee2e6', padding: 6, color: '#721c24', fontWeight: 'bold' }}>Red (Dashed)</td>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>Inactive/Down</td>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>Connection is not working or failed</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>
                <div style={{ width: 30, height: 2, backgroundColor: '#343a40', borderRadius: 1, border: '1px solid #ccc' }}></div>
              </td>
              <td style={{ border: '1px solid #dee2e6', padding: 6, color: '#343a40', fontWeight: 'bold' }}>Gray</td>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>Default/Unknown</td>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>Connection status is unknown or default</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>
                <div style={{ width: 30, height: 3, backgroundColor: '#28a745', borderRadius: 1 }}></div>
              </td>
              <td style={{ border: '1px solid #dee2e6', padding: 6, color: '#28a745', fontWeight: 'bold' }}>Green</td>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>Primary Connection</td>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>Device is primary for this instance</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>
                <div style={{ 
                  width: 30, 
                  height: 3, 
                  backgroundColor: '#ffc107',
                  borderRadius: 1,
                  backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, #fff 2px, #fff 4px)'
                }}></div>
              </td>
              <td style={{ border: '1px solid #dee2e6', padding: 6, color: '#856404', fontWeight: 'bold' }}>Yellow (Dashed)</td>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>Standby Connection</td>
              <td style={{ border: '1px solid #dee2e6', padding: 6 }}>Device is standby for this instance</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      {/* Troubleshooting Modal */}
      {showTroubleshootModal && selectedNode && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'auto',
            width: '90%'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Network Troubleshooting - {selectedNode.label}</h3>
              <button 
                onClick={() => setShowTroubleshootModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '5px'
                }}
              >
                ×
              </button>
            </div>
            
            {(() => {
              const troubleshootInfo = getTroubleshootingSteps(selectedNode);
              return (
                <div>
                  <div style={{ 
                    padding: '10px', 
                    backgroundColor: troubleshootInfo.hasIssues ? '#f8d7da' : '#d1edff',
                    borderRadius: '4px',
                    marginBottom: '15px'
                  }}>
                    <strong>Status: </strong>
                    {troubleshootInfo.hasIssues ? 
                      '⚠️ Connection issues detected' : 
                      '✅ No obvious issues detected'
                    }
                  </div>
                  
                  <div style={{ marginBottom: '15px' }}>
                    <strong>Node Information:</strong>
                    <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                      <li>Type: {selectedNode.type}</li>
                      <li>ID: {selectedNode.id}</li>
                      {selectedNode.metadata?.device_ip && <li>IP: {selectedNode.metadata.device_ip}</li>}
                      {selectedNode.metadata?.Location && <li>Location: {selectedNode.metadata.Location}</li>}
                      {selectedNode.upf_sub_count !== undefined && <li>UPF Subscribers: {selectedNode.upf_sub_count}</li>}
                    </ul>
                  </div>
                  
                  <div style={{ marginBottom: '15px' }}>
                    <strong>Quick Actions:</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                      <button 
                        onClick={() => executeTroubleshootingAction('ping', selectedNode)}
                        style={{ 
                          padding: '6px 12px', 
                          backgroundColor: '#007bff', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Ping Test
                      </button>
                      <button 
                        onClick={() => executeTroubleshootingAction('traceroute', selectedNode)}
                        style={{ 
                          padding: '6px 12px', 
                          backgroundColor: '#28a745', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Trace Route
                      </button>
                      <button 
                        onClick={() => executeTroubleshootingAction('check_logs', selectedNode)}
                        style={{ 
                          padding: '6px 12px', 
                          backgroundColor: '#ffc107', 
                          color: 'black', 
                          border: 'none', 
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Check Logs
                      </button>
                      {troubleshootInfo.hasIssues && (
                        <button 
                          onClick={() => executeTroubleshootingAction('reset_connection', selectedNode)}
                          style={{ 
                            padding: '6px 12px', 
                            backgroundColor: '#dc3545', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Reset Connection
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <strong>Troubleshooting Steps:</strong>
                    <ol style={{ margin: '5px 0', paddingLeft: '20px' }}>
                      {troubleshootInfo.steps.map((step, index) => (
                        <li key={index} style={{ marginBottom: '4px' }}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
export default TopologyGraph;
