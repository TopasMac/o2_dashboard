// HK cleaning checklist configuration
// All sections/items are defined here so the form can stay fully dynamic.

// Determine a simple capacity band from the unit data
// We try maxGuests, then capacity, then bedrooms * 2, defaulting to 2.
export function getCapacityBand(unit) {
  const maxGuests =
    (unit && (unit.maxGuests || unit.capacity)) ||
    (unit && unit.bedrooms ? unit.bedrooms * 2 : 2);

  if (maxGuests <= 2) return 'x2';
  if (maxGuests <= 4) return 'x4';
  if (maxGuests <= 6) return 'x6';
  return 'x8_plus';
}

// Sections + items
// type:
// - 'boolean'       simple yes/no checkpoint
// - 'quantityHint'  shows a dynamic "(min X)" based on capacity band
export const HK_CHECKLIST_SECTIONS = [
  {
    key: 'bedroom',
    label: 'Dormitorios',
    items: [
      {
        key: 'bedroom_sheets',
        label: 'Sábanas, fundas y cobertores limpios',
        type: 'boolean',
      },
      {
        key: 'bedroom_towels',
        label: 'Toallas de playa y manos',
        type: 'boolean',
      },
      {
        key: 'bedroom_ac_remote',
        label: 'AC funcionando + control remoto',
        type: 'boolean',
      },
      {
        key: 'bedroom_tv_remote',
        label: 'TV funcionando + control remoto',
        type: 'boolean',
      },
    ],
  },
  {
    key: 'bathroom',
    label: 'Baños',
    items: [
      {
        key: 'bathroom_amenities',
        label: 'Shampoo, jabón de baño y manos',
        type: 'boolean',
      },
      {
        key: 'bathroom_pressure',
        label: 'Presión correcta de la regadera y grifo',
        type: 'boolean',
      },
      {
        key: 'bathroom_toilet',
        label: 'Retrete limpio, sin manchas y funcionando',
        type: 'boolean',
      },
      {
        key: 'bathroom_trash',
        label: 'Bote de basura vacío',
        type: 'boolean',
      },
      {
        key: 'bathroom_hairdryer',
        label: 'Secadora de pelo',
        type: 'boolean',
      },
      {
        key: 'bathroom_hand_towel',
        label: 'Toalla de manos',
        type: 'boolean',
      },
      {
        key: 'bathroom_floor_mat',
        label: 'Tapete de baño',
        type: 'boolean',
      },
      {
        key: 'bathroom_toilet_paper',
        label: 'Papel higiénico',
        type: 'quantityHint',
        // Base rule: estudios/1 recámara: min 2 rollos, va subiendo con capacidad
        minByCapacity: {
          x2: 2,
          x4: 2,
          x6: 2,
          x8_plus: 2,
        },
      },
    ],
  },
  {
    key: 'living',
    label: 'Estancia',
    items: [
      {
        key: 'living_sofa',
        label: 'Sofá limpio',
        type: 'boolean',
      },
      {
        key: 'living_ac_tv',
        label: 'AC y TV funcionando + controles',
        type: 'boolean',
      },
    ],
  },
  {
    key: 'kitchen',
    label: 'Cocina',
    items: [
      {
        key: 'kitchen_coffee_filter',
        label: 'Filtro de cafetera limpio',
        type: 'boolean',
      },
      {
        key: 'kitchen_microwave_oven',
        label: 'Microondas y horno limpios',
        type: 'boolean',
      },
      {
        key: 'kitchen_toaster',
        label: 'Tostador limpio',
        type: 'boolean',
      },
      {
        key: 'kitchen_fridge_water',
        label: 'Refri limpio + aguas',
        type: 'quantityHint',
        // Base rule: más botellas según capacidad (ej. 4 para 2 pax, 8 para 4 pax, etc.)
        minByCapacity: {
          x2: 4,
          x4: 8,
          x6: 12,
          x8_plus: 16,
        },
      },
      {
        key: 'kitchen_trash',
        label: 'Bote de basura vacío',
        type: 'boolean',
      },
      {
        key: 'kitchen_supplies',
        label: 'Servitoalla, fibra y detergente',
        type: 'boolean',
      },
    ],
  },
  {
    key: 'utensils',
    label: 'Utensilios',
    items: [
      {
        key: 'utensils_clean_all',
        label: 'Utensilios limpios (verificar gabinetes)',
        type: 'boolean',
      },
      {
        key: 'utensils_cutlery',
        label: 'Cubiertos',
        type: 'quantityHint',
        minByCapacity: {
          x2: 4,
          x4: 8,
          x6: 12,
          x8_plus: 16,
        },
      },
      {
        key: 'utensils_water_glasses',
        label: 'Copas/vasos de agua',
        type: 'quantityHint',
        minByCapacity: {
          x2: 4,
          x4: 8,
          x6: 12,
          x8_plus: 16,
        },
      },
      {
        key: 'utensils_wine_glasses',
        label: 'Copas de vino',
        type: 'quantityHint',
        minByCapacity: {
          x2: 4,
          x4: 8,
          x6: 12,
          x8_plus: 16,
        },
      },
      {
        key: 'utensils_plates',
        label: 'Platos',
        type: 'quantityHint',
        minByCapacity: {
          x2: 4,
          x4: 8,
          x6: 12,
          x8_plus: 16,
        },
      },
    ],
  },
];

// Helper: flatten all items if needed elsewhere (e.g., to check all-checked)
export function getAllChecklistItems() {
  return HK_CHECKLIST_SECTIONS.flatMap(section => section.items);
}
