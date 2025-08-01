import React from 'react';
import TopologyGraph from './TopologyGraph';

export default function App() {
  return (
    <div>
      {/* Header with Cisco logo at left and title at center */}
      <div
        style={{
          position: 'relative',
          backgroundColor: '#0080e4',
          padding: '8px 16px',
          color: 'white',
          marginBottom: 16,
          height: 44,
          display: 'flex',
          alignItems: 'center'
        }}
      >
        {/* Logo at left */}
        <img
          src="/icons/cisco.png"
          alt="Cisco Logo"
          style={{
            height: 30,
            position: 'absolute',
            left: 16,
            top: '50%',
            transform: 'translateY(-50%)'
          }}
        />
        {/* Title at center */}
        <h1
          style={{
            margin: 0,
            fontWeight: 400,
            fontSize: 20,
            letterSpacing: 1,
            width: '100%',
            textAlign: 'center',
            color: 'black',
            fontFamily: "'Roboto', sans-serif"
          }}
        >
          cnBNG Live Network Topology
        </h1>
      </div>
      <TopologyGraph />
    </div>
  );
}
