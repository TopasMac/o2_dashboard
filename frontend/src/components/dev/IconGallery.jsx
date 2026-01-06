import React, { useMemo, useState } from 'react';
import * as Hi2 from 'react-icons/hi2';

/**
 * IconGallery — quick developer tool to browse Heroicons v2 (react-icons/hi2)
 * - Live search by icon component name (case-insensitive)
 * - Adjustable preview size
 * - Click a tile to copy the React import/usage snippet
 */
export default function IconGallery() {
  const [query, setQuery] = useState('');
  const [size, setSize] = useState(28);
  const [copied, setCopied] = useState(null);

  const icons = useMemo(() => {
    // Pull only valid React components from the module
    const entries = Object.entries(Hi2).filter(([name, Comp]) => typeof Comp === 'function');
    // Sort alphabetically by name for stable browsing
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    if (!query) return entries;
    const q = query.toLowerCase();
    return entries.filter(([name]) => name.toLowerCase().includes(q));
  }, [query]);

  const onCopy = async (name) => {
    const snippet = `import { ${name} } from 'react-icons/hi2';\n\n<${name} size={22} />`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(name);
      setTimeout(() => setCopied(null), 1200);
    } catch (e) {
      console.warn('Clipboard unavailable, logging snippet:', snippet);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Heroicons v2 — Icon Gallery (react-icons/hi2)</h1>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search icons (e.g., Map, Arrow, User)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            padding: '8px 10px',
            minWidth: 260,
            border: '1px solid #ddd',
            borderRadius: 6,
            outline: 'none'
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#555' }}>Size</span>
          <input
            type="range"
            min={12}
            max={80}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
          <span style={{ width: 36, textAlign: 'right' }}>{size}px</span>
        </label>
        <span style={{ color: '#777' }}>{icons.length} icons</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 12
        }}
      >
        {icons.map(([name, Comp]) => (
          <button
            key={name}
            onClick={() => onCopy(name)}
            title={`Click to copy import + usage for ${name}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              background: '#fff',
              cursor: 'pointer'
            }}
          >
            <Comp size={size} aria-label={name} />
            <div style={{ marginTop: 8, fontSize: 12, color: '#374151', textAlign: 'center' }}>{name}</div>
            {copied === name && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#059669' }}>Copied!</div>
            )}
          </button>
        ))}
      </div>

      <p style={{ marginTop: 16, color: '#6b7280', fontSize: 12 }}>
        Tip: Click any tile to copy a ready-to-paste import + usage snippet.
      </p>
    </div>
  );
}