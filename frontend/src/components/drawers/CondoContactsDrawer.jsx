import React from 'react';
import AppDrawer from '../common/AppDrawer';
import DrawerScaffold from '../common/DrawerScaffold';
import DrawerSectionTitle from '../common/DrawerSectionTitle';
import {
  PhoneIcon,
  EnvelopeIcon,
  PencilSquareIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import CondoContactNewDrawerForm from '../forms/CondoContactNewDrawerForm';
import CondoContactEditDrawerForm from '../forms/CondoContactEditDrawerForm';

/**
 * CondoContactsDrawer
 * Minimal scaffold – uses AppDrawer header
 */
export default function CondoContactsDrawer({
  open,
  onClose,
  condoName,
  condoId,
  condoIri,
  onContactCreated,
  activeUnits = [],
  contacts = [],
  footer = null,
  footerSticky = true,
  children,
}) {
  const title = condoName ? `${condoName} · Contacts` : 'Contacts';
  const [isNewContactOpen, setIsNewContactOpen] = React.useState(false);
  const [isEditContactOpen, setIsEditContactOpen] = React.useState(false);
  const [editingContact, setEditingContact] = React.useState(null);

  const notifyContactsChanged = (payload) => {
    try {
      // In Condos.jsx this triggers reloadContacts(), and it safely ignores the payload.
      if (typeof onContactCreated === 'function') {
        onContactCreated(payload);
      }
    } catch {}
  };

  return (
    <AppDrawer
      open={open}
      onClose={onClose}
      size="default"
      title={title}
      hideHeader={false}
    >
      <DrawerScaffold footer={footer} footerSticky={footerSticky}>
        <DrawerSectionTitle title="Active Units" />

        {Array.isArray(activeUnits) && activeUnits.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {activeUnits.map((u, idx) => {
              const label = typeof u === 'string' ? u : (u?.unitName || u?.name || String(u?.id || idx));
              return (
                <div
                  key={(typeof u === 'string' ? u : (u?.id || idx))}
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#111827',
                    lineHeight: '20px',
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
            No active units.
          </div>
        )}

        <div style={{ height: 10 }} />
        <DrawerSectionTitle
          title="Contacts"
          rightActions={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsNewContactOpen(true)}
            >
              + Contact
            </button>
          }
        />

        {Array.isArray(contacts) && contacts.length > 0 ? (
          ['Admin', 'Front Desk'].map((dept) => {
            const deptContacts = contacts.filter(c => (c?.department || '').toLowerCase() === dept.toLowerCase());
            if (deptContacts.length === 0) return null;

            return (
              <div key={dept} style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  {dept}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {deptContacts.map((c, idx) => (
                    <div
                      key={c.id || idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        paddingBottom: 8,
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      {/* Name + actions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          {c.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingContact(c);
                              setIsEditContactOpen(true);
                            }}
                            aria-label="Edit"
                            title="Edit"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <PencilIcon style={{ width: 16, height: 16, color: '#6b7280' }} />
                          </button>
                        </div>
                      </div>

                      {/* Phone / Email */}
                      {(c.phone || c.email) && (
                        <div
                          style={{
                            fontSize: 13,
                            color: '#6b7280',
                            display: 'grid',
                            gridTemplateColumns: '0.9fr 1.1fr',
                            columnGap: 4, // tighter gap between phone and email columns
                            rowGap: 0,
                            alignItems: 'center',
                            minWidth: 0,
                          }}
                        >
                          {/* Phone column (keeps icon aligned across rows) */}
                          {c.phone ? (
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '14px 1fr',
                                alignItems: 'center',
                                columnGap: 2,
                                minWidth: 0,
                              }}
                            >
                              <PhoneIcon style={{ width: 14, height: 14, color: '#9ca3af' }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.phone}
                              </span>
                            </div>
                          ) : null}

                          {/* Email column (keeps icon aligned across rows) */}
                          {c.email ? (
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '14px 1fr',
                                alignItems: 'center',
                                columnGap: 2,
                                minWidth: 0,
                              }}
                            >
                              <EnvelopeIcon style={{ width: 14, height: 14, color: '#9ca3af' }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.email}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      )}

                      {/* Notes */}
                      {c.notes && (
                        <div style={{ fontSize: 13, color: '#6b7280', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <PencilSquareIcon style={{ width: 14, height: 14, color: '#9ca3af', marginTop: 2 }} />
                          <span>{c.notes}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
            No contacts.
          </div>
        )}

        {children || null}
      </DrawerScaffold>

      <CondoContactNewDrawerForm
        open={isNewContactOpen}
        onClose={() => setIsNewContactOpen(false)}
        condoId={condoId}
        condoIri={condoIri}
        onCreated={(newContact) => {
          try {
            if (typeof onContactCreated === 'function') {
              onContactCreated(newContact);
            }
          } catch {}
        }}
      />
      <CondoContactEditDrawerForm
        open={isEditContactOpen}
        onClose={() => {
          setIsEditContactOpen(false);
          setEditingContact(null);
        }}
        contact={editingContact}
        onUpdated={(updated) => {
          notifyContactsChanged(updated);
        }}
        onDeleted={(deletedId) => {
          notifyContactsChanged({ id: deletedId, deleted: true });
        }}
      />
    </AppDrawer>
  );
}
