import React from 'react';

export default function SoftwareDescriptionFields({ selection, options, showCustom, description, onSelectionChange, onDescriptionChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
      <select
        aria-label="Descripción"
        value={selection}
        onChange={(e) => onSelectionChange(e.target.value)}
        style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
      >
        <option value="">Seleccione…</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
        <option value="Otro">Otro</option>
      </select>
      {showCustom && (
        <input
          type="text"
          name="description"
          aria-label="Descripción personalizada"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Especifique…"
          style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
        />
      )}
    </div>
  );
}
