export const cars = [
  { id: 'DA_CarModel_Genesis_GV70_2025', name: 'Genesis GV70', price: 'From $48,985', img: '/images/cars/genesis_gv7.png' },
  { id: 'DA_CarModel_Genesis_XGran', name: 'Genesis X Gran', price: 'From $52,350', img: '/images/cars/porsche_911_carreraT.avif' },
  { id: 'DA_CarModel_Porsche_911_2025', name: 'Porsche 911', price: 'From $151,700', img: '/images/cars/porsche_911_carreraS.avif' },
  { id: 'DA_CarModel_Auto_A0_2025', name: 'Auto A0', price: 'From $159,800', img: '/images/cars/porsche_911_carrera4S.avif' },
  { id: '911CarreraGTS', name: '911 Carrera GTS', price: 'From $175,900', img: '/images/cars/porsche_911_carreraGTS.avif' },
  { id: '911Carrera4GTS', name: '911 Carrera 4GTS', price: 'From $184,000', img: '/images/cars/porsche_911_carrera4GTS.avif' },
];

export const carMap = Object.fromEntries(cars.map(c => [c.id, c]));
