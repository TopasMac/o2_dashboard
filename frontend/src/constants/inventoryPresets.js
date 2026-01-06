// Inventory presets by Área (Spanish labels to match UI)
const PRESETS = {
  'Baño': [
    'Toallas mano',
    'Toallas cuerpo',
    'Taza baño',
    'Lavabo',
    'Espejo',
    'Cortina/Cancel',
    'Tapete baño',
    'Bote basura',
    'Porta papel',
    'Gancho toallas',
  ],
  'Baño Master': null,
  'Recámara Master': [
    'Cama King',
    'Cama Queen',
    'Cama Individual',
    'Colchón',
    'Almohadas',
    'Juegos sábanas',
    'Edredón/Colcha',
    'Buro(s)',
    'Lámparas',
    'Clóset perchas',
    'TV',
    'Cortinas/Blacks out',
    'Aire Acondicionado',
    'Control Aire',
  ],
  'Recamara': [
    'Cama King',
    'Cama Queen',
    'Cama Individual',
    'Colchón',
    'Almohadas',
    'Juegos sábanas',
    'Edredón/Colcha',
    'Buro(s)',
    'Lámparas',
    'Clóset perchas',
    'TV',
    'Cortinas/Blacks out',
    'Aire Acondicionado',
    'Control Aire',
  ],
  'Sala': [
    'Sofá',
    'Sofá Cama',
    'Mesa de centro',
    'TV',
    'Control remoto',
    'Cortinas',
    'Aire Acondicionado',
    'Control Aire',
  ],
  'Comedor': [
    'Mesa comedor',
    'Sillas',
    'Centro de mesa',
    'Aire Acondicionado',
    'Control Aire',
  ],
  'Cocina': [
    'Refrigerador',
    'Estufa',
    'Horno microondas',
    'Cafetera',
    'Tostador',
    'Licuadora',
    'Utensilios básicos',
    'Platos',
    'Vasos',
    'Cubiertos',
    'Sartenes',
    'Ollas',
    'Trapos cocina',
    'Bote basura',
  ],
  'Lavandería': [
    'Lavadora',
    'Secadora',
    'Tendedero',
    'Plancha',
    'Tabla planchar',
  ],
  'Terraza / Balcón': [
    'Mesa exterior',
    'Sillas exteriores',
    'Cojines',
    'Cenicero',
  ],
  'Otros': [
    // vacío por diseño; se escribirá el nombre del área personalizada
  ],
};

// Make "Baño Master" share same presets as "Baño"
if (!PRESETS['Baño Master']) {
  PRESETS['Baño Master'] = PRESETS['Baño'];
}

export default PRESETS;
