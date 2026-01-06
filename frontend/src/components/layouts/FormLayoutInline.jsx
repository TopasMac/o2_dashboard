import React, { useRef, useState, useEffect } from 'react';
import './FormLayoutInline.css';
import FormRow from './FormRow';
import './Buttons.css';
import { parseMoneyEuro } from '../../utils/money';
import { toast } from 'react-toastify';

const extractId = (result) => {
  if (!result) return null;
  const val = result.data ?? result;
  if (!val) return null;
  if (typeof val === 'object') {
    if (val.id != null) return String(val.id);
    if (val['@id']) {
      const m = String(val['@id']).match(/\/(\d+)(?:$|\b)/);
      if (m) return m[1];
    }
    if (val.headers && val.headers.location) {
      const m = String(val.headers.location).match(/\/(\d+)(?:$|\b)/);
      if (m) return m[1];
    }
  }
  return null;
};

/**
 * FormLayout Component
 * Wraps form content in a consistent layout with optional title and description.
 *
 * Props:
 * - title (string): Optional form title displayed at the top
 * - description (string): Optional form description displayed under the title
 * - children (ReactNode): The form fields and buttons
 * - onSubmit (function): Form submit handler
 *
 * Global action controls (optional):
 * - renderSave (boolean): If true, renders a default Submit (Save) button in the footer (defaults to false)
 * - showCancel (boolean): If true, renders a Cancel button in the footer
 * - showDelete (boolean): If true, renders a Delete button in the footer
 * - mode ("new" | "edit"): If set to "edit", Delete will be shown unless explicitly hidden (showDelete=false)
 * - onCancel (function): Click handler for Cancel
 * - onDelete (function): Click handler for Delete
 * - saveLabel (string): Label for the Save button (default: "Save")
 * - cancelLabel (string): Label for the Cancel button (default: "Cancel")
 * - deleteLabel (string): Label for the Delete button (default: "Delete")
 * - actionsAlign ("left" | "right" | "center"): alignment of the footer actions (default: "right")
 * - deleteDisabled (boolean): disables the Delete button when true
 */
const FormLayout = ({
  title,
  description,
  children,
  onSubmit,
  // footer/action props
  renderSave = false,
  showCancel = false,
  showDelete = undefined,
  mode = undefined,
  onCancel,
  onDelete,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  deleteLabel = 'Delete',
  actionsAlign = 'right',
  deleteDisabled = false,
  moneyFields = [],
}) => {
  const [submitError, setSubmitError] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const formRef = useRef(null);
  // Prevent accidental changes on number inputs via arrow keys or mouse wheel
  useEffect(() => {
    const formEl = formRef.current;
    if (!formEl) return;

    const blockKeys = (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'number') {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown') {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    const blockWheel = (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'number') {
        // Prevent changing value when scrolling over the input
        e.preventDefault();
      }
    };

    formEl.addEventListener('keydown', blockKeys, true);
    formEl.addEventListener('wheel', blockWheel, { passive: false });

    return () => {
      formEl.removeEventListener('keydown', blockKeys, true);
      formEl.removeEventListener('wheel', blockWheel, { passive: false });
    };
  }, [formKey]);
  // Determine which actions to show
  const shouldShowDelete = (showDelete !== undefined ? showDelete : mode === 'edit') === true;
  const shouldShowAnyFooter = renderSave || showCancel || shouldShowDelete;

  const handleCancel = (e) => {
    if (e) e.preventDefault();
    if (typeof onCancel === 'function') {
      try {
        return onCancel(e);
      } catch (err) {
        console.error('onCancel handler threw', err);
      }
    }
    // No routing fallback here by design
  };

  const handleDelete = (e) => {
    if (!onDelete) return;
    e.preventDefault();
    try {
      const maybePromise = onDelete(e);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise
          .then(() => {
            toast.success('Deleted');
            try {
              if (typeof onCancel === 'function') onCancel();
            } catch (_) {}
          })
          .catch((err) => {
            console.error('Delete failed', err);
            toast.error('Failed to delete');
          });
      }
    } catch (err) {
      console.error('Delete handler threw', err);
      toast.error('Failed to delete');
    }
  };

  const handleSubmit = (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setSubmitError(null);
    // If caller passed its own onSubmit, we will normalize fields first, then delegate.
    try {
      if (Array.isArray(moneyFields) && moneyFields.length > 0) {
        const formEl = e?.target?.closest('form') || e?.currentTarget;
        if (formEl) {
          moneyFields.forEach((name) => {
            const input = formEl.querySelector(`[name="${name}"]`);
            if (input && typeof input.value === 'string' && input.value.trim() !== '') {
              const parsed = parseMoneyEuro(input.value);
              if (parsed !== '') {
                input.value = parsed;
                const evt = new Event('input', { bubbles: true });
                input.dispatchEvent(evt);
              }
            }
          });
        }
      }
    } catch (_) {
      // Swallow normalization errors; do not block submit
    }
    if (typeof onSubmit === 'function') {
      try {
        const maybePromise = onSubmit(e);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise
            .then((result) => {
              try { toast.success('Saved'); } catch {}
              // If creating a new entry (not editing), clear form values so "Add another" starts blank
              try {
                if (mode !== 'edit') {
                  // Reset native inputs
                  if (formRef && formRef.current) {
                    formRef.current.reset?.();
                  }
                  // Ask any custom fields to clear their internal state
                  window.dispatchEvent(new CustomEvent('formlayout:reset'));
                  // Force a remount to drop any lingering local state in controlled components
                  setFormKey((k) => k + 1);
                }
              } catch (_) {}
              // Close the drawer via the caller's handler, if provided
              try {
                if (typeof onCancel === 'function') onCancel();
              } catch (_) {}
              // Emit highlight so the table can scroll/flash the row
              try {
                const id = extractId(result);
                if (id) {
                  window.dispatchEvent(new CustomEvent('datatable:highlight', { detail: { id } }));
                }
              } catch (_) {}
            })
            .catch((err) => {
              console.error('Save failed', err);
              const apiMessage =
                err?.response?.data?.detail ||
                err?.response?.data?.message ||
                err?.message ||
                'Failed to save';
              setSubmitError(apiMessage);
              try { toast.error(apiMessage, { autoClose: 1000 }); } catch {}
            });
        }
        return maybePromise;
      } catch (err) {
        console.error('Submit handler threw', err);
        const apiMessage =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          'Failed to save';
        setSubmitError(apiMessage);
        try { toast.error(apiMessage, { autoClose: 1000 }); } catch {}
      }
    }
  };

  return (
    <div className="form-layout form-layout-inline">
      <form
        key={formKey}
        ref={formRef}
        className="form-inline notched-form"
        onSubmit={handleSubmit}
      >
        {title && <h2 className="form-layout-title">{title}</h2>}
        {description && <p className="form-layout-description">{description}</p>}

        {children}

        {submitError && (
          <div className="form-error" role="alert">
            {submitError}
          </div>
        )}

        {shouldShowAnyFooter && (
          <div className={`form-actions form-actions-${actionsAlign}`}>
            <div className="form-actions-left">
              {renderSave && (
                <button type="submit" className="btn-primary">
                  {saveLabel}
                </button>
              )}
              {showCancel && (
                <button type="button" className="btn-secondary" onClick={handleCancel}>
                  {cancelLabel}
                </button>
              )}
            </div>
            <div className="form-actions-right">
              {shouldShowDelete && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={handleDelete}
                  disabled={deleteDisabled}
                >
                  {deleteLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

FormLayout.Row = FormRow;

export default FormLayout;