import React, { useMemo, useState, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import MobileFormScaffold from "./MobileFormScaffold";
import api from "../../../api";
import O2ConfirmDialogMobile from "../mobileComponents/O2ConfirmDialogMobile";
import {
  HK_CHECKLIST_SECTIONS,
  getCapacityBand,
  getAllChecklistItems,
} from "../mobileComponents/hkChecklistConfig";

/**
 * Mobile housekeeping checklist form.
 *
 * Props:
 * - cleaning: hk_cleanings row (must have id, unitId, etc.)
 * - unit: unit object (used for name + capacity band)
 * - onClose: function called when user closes / cancels
 * - onSuccess: function called with API response on success
 */
const sectionOrder = ["kitchen", "utensils", "living", "bedroom", "bathroom"];

const MAX_FILES = 3;

function getOrderedSections() {
  const map = Object.fromEntries(HK_CHECKLIST_SECTIONS.map((s) => [s.key, s]));
  const ordered = sectionOrder
    .map((key) => map[key])
    .filter(Boolean);
  // Fallback to any remaining sections not in sectionOrder
  const remaining = HK_CHECKLIST_SECTIONS.filter(
    (s) => !sectionOrder.includes(s.key)
  );
  return [...ordered, ...remaining];
}

const MobileHKCheckListForm = ({ cleaning, unit, initialData = null, readOnly = false, onClose, onSuccess }) => {
  const { i18n } = useTranslation('common');
  const isEs = String(i18n?.language || '').toLowerCase().startsWith('es');
  const draftLabel = isEs ? 'Guardar' : 'Draft';
  const [activeSectionKey, setActiveSectionKey] = useState("kitchen");
  const [checks, setChecks] = useState(() => {
    const arr = Array.isArray(initialData?.checklistData) ? initialData.checklistData : null;
    if (!arr) return {};
    const map = {};
    arr.forEach((it) => {
      if (it && it.key) map[it.key] = !!it.checked;
    });
    return map;
  }); // { itemKey: boolean }
  const [notes, setNotes] = useState(() => (typeof initialData?.notes === 'string' ? initialData.notes : ''));
  const [files, setFiles] = useState([]); // File[]
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingSections, setMissingSections] = useState([]); // string[]

  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    if (readOnly) return;
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

    const combined = [...files, ...selected];
    if (combined.length > MAX_FILES) {
      alert(`Máximo ${MAX_FILES} fotos permitidas.`);
    }
    setFiles(combined.slice(0, MAX_FILES));

    // reset input so user can re-select same file if needed
    if (e.target) {
      e.target.value = "";
    }
  };

  const handleClickPhotos = () => {
    if (readOnly) return;
    if (files.length >= MAX_FILES) {
      alert(`Máximo ${MAX_FILES} fotos permitidas.`);
      return;
    }
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRemoveFile = (index) => {
    if (readOnly) return;
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const orderedSections = useMemo(() => getOrderedSections(), []);

  const unitName =
    unit?.unitName || unit?.unit_name || cleaning?.unitName || cleaning?.unit_name || "Unidad";

  const capacityBand = useMemo(() => getCapacityBand(unit || null), [unit]);

  const allItems = useMemo(() => getAllChecklistItems(), []);

  const allChecked = useMemo(
    () => allItems.every((item) => !!checks[item.key]),
    [allItems, checks]
  );

  React.useEffect(() => {
    if (!initialData) return;

    // Hydrate checks + notes from server state (draft or submitted)
    if (Array.isArray(initialData.checklistData)) {
      const map = {};
      initialData.checklistData.forEach((it) => {
        if (it && it.key) map[it.key] = !!it.checked;
      });
      setChecks(map);

      // If the hydrated data has missing items, jump user to the first section with missing fields.
      const firstMissing = orderedSections.find(
        (section) =>
          Array.isArray(section.items) &&
          section.items.some((it) => !map[it.key])
      );
      if (firstMissing?.key) {
        setActiveSectionKey(firstMissing.key);
      }
    }

    if (typeof initialData.notes === 'string') {
      setNotes(initialData.notes);
    }

    // Draft/submitted state should not pre-fill local file picker
    setFiles([]);
  }, [initialData, orderedSections]);


  const handlePrevSection = () => {
    if (readOnly) return;
    const idx = orderedSections.findIndex((s) => s.key === activeSectionKey);
    if (idx > 0) {
      setActiveSectionKey(orderedSections[idx - 1].key);
    }
  };

  const handleNextSection = () => {
    if (readOnly) return;
    const idx = orderedSections.findIndex((s) => s.key === activeSectionKey);
    if (idx >= 0 && idx < orderedSections.length - 1) {
      setActiveSectionKey(orderedSections[idx + 1].key);
    }
  };

  const handleToggleItem = (key) => {
    if (readOnly) return;
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const buildChecklistData = () => {
    return allItems.map((item) => {
      const base = {
        key: item.key,
        checked: !!checks[item.key],
      };
      if (item.type === "quantityHint" && item.minByCapacity?.[capacityBand]) {
        base.expectedMin = item.minByCapacity[capacityBand];
      }
      return base;
    });
  };

  const submitChecklist = async () => {
    if (!cleaning?.id) return;
    if (readOnly) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      const checklistData = buildChecklistData();
      fd.append("checklistData", JSON.stringify(checklistData));
      if (notes && notes.trim()) {
        fd.append("notes", notes.trim());
      }
      // If you prefer to send explicit employeeId, pass it via props and append here.
      // if (employeeId) fd.append("employeeId", String(employeeId));

      files.forEach((file) => {
        fd.append("files", file);
      });

      const url = `/api/hk-cleanings/${cleaning.id}/submit-checklist`;
      const response = await api.post(url, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (err) {
      console.error("Error submitting HK checklist", err);
      // @todo: hook into your global toast/snackbar system if desired
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (readOnly) return;
  
    // Determine which sections have at least one unchecked item
    const missing = orderedSections
      .filter((section) => Array.isArray(section.items) && section.items.some((it) => !checks[it.key]))
      .map((section) => section.label)
      .filter(Boolean);
  
    if (missing.length > 0) {
      setMissingSections(missing);
      setMissingOpen(true);
      return;
    }
  
    setConfirmOpen(true);
  };

  const handleConfirmSubmit = async () => {
    setConfirmOpen(false);
    await submitChecklist();
  };

  const handleSaveDraft = async () => {
    if (!cleaning?.id) return;
    if (readOnly) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      const checklistData = buildChecklistData();
      fd.append('checklistData', JSON.stringify(checklistData));
      if (notes && notes.trim()) {
        fd.append('notes', notes.trim());
      }

      files.forEach((file) => {
        fd.append('files', file);
      });

      const url = `/api/hk-cleanings/${cleaning.id}/save-checklist-draft`;
      const response = await api.post(url, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success(isEs ? 'Borrador guardado' : 'Draft saved', { autoClose: 1000 });

      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (err) {
      console.error('Error saving HK checklist draft', err);
      // @todo: hook into your global toast/snackbar system if desired
    } finally {
      setSubmitting(false);
    }
  };

  const activeSection = orderedSections.find((s) => s.key === activeSectionKey) ||
    orderedSections[0];

  return (
    <MobileFormScaffold
      title={`${unitName} CheckList`}
      onBack={onClose}
      onSubmit={handleSubmit}
      showCancel
      cancelLabel="Cancelar"
      onCancel={onClose}
      showDraft={!readOnly}
      draftLabel={draftLabel}
      onDraft={handleSaveDraft}
      showSubmit={!readOnly}
      submitLabel={isEs ? 'Enviar' : 'Send'}
      submitDisabled={readOnly || submitting}
      actionsDisabled={submitting}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* Top: navigation + checklist area (fills available height) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
          }}
        >
          {/* Section navigation */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginBottom: 12,
            }}
          >
            {/* Top row: area labels */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 1,
              }}
            >
              {orderedSections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={readOnly ? undefined : () => setActiveSectionKey(section.key)}
                  style={{
                    padding: "4px 6px",
                    borderRadius: 16,
                    border: "none",
                    backgroundColor: "transparent",
                    fontSize: 14,
                    fontWeight: activeSectionKey === section.key ? 700 : 400,
                    color: activeSectionKey === section.key ? "#1E6F68" : "#111827",
                    whiteSpace: "nowrap",
                    cursor: readOnly ? 'default' : 'pointer',
                    opacity: readOnly ? 0.6 : 1,
                  }}
                >
                  {section.label}
                </button>
              ))}
            </div>

            {/* Bottom row: < current area > */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 50,
                marginTop: 4,
              }}
            >
              <button
                type="button"
                onClick={handlePrevSection}
                disabled={readOnly || orderedSections.findIndex((s) => s.key === activeSectionKey) <= 0}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#111827",
                  opacity:
                    orderedSections.findIndex((s) => s.key === activeSectionKey) <= 0 || readOnly
                      ? 0.4
                      : 1,
                }}
              >
                {"<"}
              </button>
              <span style={{ fontSize: 18, fontWeight: 600, color: "#1E6F68" }}>
                {activeSection?.label}
              </span>
              <button
                type="button"
                onClick={handleNextSection}
                disabled={
                  readOnly ||
                  orderedSections.findIndex((s) => s.key === activeSectionKey) >=
                    orderedSections.length - 1
                }
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#111827",
                  opacity:
                    readOnly ||
                    orderedSections.findIndex((s) => s.key === activeSectionKey) >=
                      orderedSections.length - 1
                      ? 0.4
                      : 1,
                }}
              >
                {">"}
              </button>
            </div>
          </div>

          {/* Active section checklist – fills the remaining vertical space and scrolls */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 16,
              flexGrow: 1,
              overflowY: "auto",
            }}
          >
            {activeSection?.items?.map((item) => {
              const isChecked = !!checks[item.key];
              let label = item.label;
              if (item.type === "quantityHint" && item.minByCapacity?.[capacityBand]) {
                label = `${item.label} (min ${item.minByCapacity[capacityBand]})`;
              }

              return (
                <label
                  key={item.key}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleItem(item.key)}
                    disabled={readOnly}
                    style={{
                      marginTop: 3,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',

                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      appearance: 'none',
                      outline: 'none',

                      border: '2px solid #1E6F68',
                      cursor: readOnly ? 'default' : 'pointer',
                      opacity: readOnly ? 0.7 : 1,
                      backgroundColor: isChecked ? '#1E6F68' : '#ffffff',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontSize: 14, lineHeight: "20px" }}>{label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Bottom: Notes + images */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            paddingTop: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Notas</div>
            <textarea
              value={notes}
              onChange={(e) => { if (!readOnly) setNotes(e.target.value); }}
              rows={6}
              placeholder="Anota cualquier detalle importante (daños, faltantes, etc.)"
              readOnly={readOnly}
              style={{
                width: "100%",
                fontSize: 14,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                resize: "vertical",
                height: 120,
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              Fotos
            </div>
            <div
              onClick={readOnly ? undefined : handleClickPhotos}
              style={{
                display: "flex",
                gap: 6,
                marginBottom: 16,
                cursor: (!readOnly && files.length < MAX_FILES) ? "pointer" : "default",
                pointerEvents: readOnly ? 'none' : 'auto',
              }}
            >
              {Array.from({ length: MAX_FILES }).map((_, idx) => {
                const active = idx < files.length;
                return (
                  <span
                    key={idx}
                    style={{
                      width: 30,
                      height: 30,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: active ? "#1E6F68" : "#9ca3af",
                      cursor: (!readOnly && files.length < MAX_FILES) ? "pointer" : "default",
                    }}
                  >
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      style={{ display: "block" }}
                    >
                      <path
                        d="M8.5 11.5l5.5-5.5a2.5 2.5 0 1 1 3.5 3.5l-7 7a3 3 0 0 1-4.2 0 3 3 0 0 1 0-4.2l6.3-6.3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                );
              })}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              style={{ display: "none" }}
              disabled={readOnly}
            />
            {files.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 4,
                  flexWrap: "nowrap",
                }}
              >
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Foto ${idx + 1}`}
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 8,
                        objectFit: "cover",
                        border: "1px solid #e5e7eb",
                      }}
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => { if (!readOnly) handleRemoveFile(idx); }}
                        disabled={readOnly}
                        style={{
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          cursor: "pointer",
                          color: "#dc2626",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          style={{ display: "block" }}
                        >
                          <path
                            d="M9 4h6m-7 3h8m-6 0v11m4-11v11M5 7h14l-1 13H6L5 7z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <O2ConfirmDialogMobile
        open={missingOpen}
        title={isEs ? 'Campos faltantes' : 'Missing fields'}
        description={
          (missingSections && missingSections.length)
            ? missingSections.join(', ')
            : ''
        }
        confirmLabel="OK"
        showCancel={false}
        confirmActsAsClose
        onClose={() => setMissingOpen(false)}
      />
      <O2ConfirmDialogMobile
        open={confirmOpen}
        title={isEs ? 'Confirmar limpieza' : 'Submit cleaning?'}
        confirmLabel={isEs ? 'Enviar' : 'Send'}
        cancelLabel={isEs ? 'Cancelar' : 'Cancel'}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSubmit}
      />
    </MobileFormScaffold>
  );
};

export default MobileHKCheckListForm;
