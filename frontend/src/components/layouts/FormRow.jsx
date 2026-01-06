import React from 'react';

export default function FormRow({ label, htmlFor, children, ...rest }) {
  return (
    <div className="form-row" {...rest}>
      {label && (
        <label htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}