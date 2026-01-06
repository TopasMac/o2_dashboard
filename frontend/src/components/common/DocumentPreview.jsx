import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * DocumentPreview
 * Always fetches the given URL as a Blob (with credentials) and shows it
 * using a single iframe. Avoids double-loading and keeps behavior consistent.
 */
export default function DocumentPreview({ url, style }) {
  const [objectUrl, setObjectUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const prevRemoteRef = useRef('');

  const mergedStyle = useMemo(() => ({
    display: 'block',
    width: '100%',
    height: '80vh',
    border: 'none',
    ...style,
  }), [style]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const href = (typeof url === 'string' ? url.trim() : '');
      if (!href) {
        setObjectUrl('');
        setError('');
        return;
      }
      if (prevRemoteRef.current === href && objectUrl) {
        return;
      }
      setLoading(true);
      setError('');
      try {
        // Use credentials only for same-origin/protected API; omit for public S3 (avoids CORS with *)
        const isSameOrigin = href.startsWith('/') || href.startsWith(window.location.origin);
        const isS3 = /owners2-unit-documents\.s3\./.test(href);
        const resp = await fetch(href, {
          credentials: (isSameOrigin && !isS3) ? 'include' : 'omit',
          mode: 'cors',
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const obj = URL.createObjectURL(blob);
        if (!cancelled) {
          if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch {} }
          setObjectUrl(obj);
          prevRemoteRef.current = href;
        } else {
          try { URL.revokeObjectURL(obj); } catch {}
        }
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    return () => { if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch {} } };
  }, [objectUrl]);

  if (!url) {
    return <div style={{ padding: 16, color: '#6b7280' }}>No document to preview.</div>;
  }
  const showLoading = loading || (!!url && !objectUrl && !error);
  if (showLoading) {
    return <div style={{ padding: 16, color: '#6b7280' }}>Loading preview…</div>;
  }
  if (error) {
    return <div style={{ padding: 16, color: '#b91c1c' }}>Failed to load preview: {error}</div>;
  }
  if (!objectUrl) {
    // Safety: never render an iframe with empty src
    return <div style={{ padding: 16, color: '#6b7280' }}>Preparing preview…</div>;
  }

  // Chrome blocks the built‑in PDF viewer if scripts are disallowed.
  // For blob: URLs, omit sandbox entirely; otherwise allow scripts.
  const sandboxAttr = objectUrl.startsWith('blob:')
    ? undefined
    : 'allow-same-origin allow-scripts allow-downloads';

  return (
    <iframe
      title="document-preview"
      src={objectUrl}
      style={mergedStyle}
      {...(sandboxAttr ? { sandbox: sandboxAttr } : {})}
    />
  );
}