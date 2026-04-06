// ── Sequência de montagem (inversa = desmontagem) ───────────────────────────
// Sequência de montagem — inclui duplicatas com sufixo _2
export const MONTAGEM_SEQ = [
  'support',
  'motor_body',
  'pump_casing',
  'wear_ring',
  'wear_ring_2',
  'pump_impeller',
  'shaft',
  'seal_chamber',
  'pump_lantern_ring',
  'pump_packing_set',
  'pump_packing_gland',
  'house_bearing',
  'bearing_cover',
  'bearing_cover_2',
  'pump_coupling',
  'coupling',
  'pump_protection',
]

export const DESMONTAGEM_SEQ = [...MONTAGEM_SEQ].reverse()

// Distância de snap automático (metros)
export const SNAP_DIST = 0.30  // aumentado para escala 2x do modelo

// Grupos de componentes
export const GRUPOS = {
  hidraulico:  { label: 'Hidráulico',   cor: '#00C8FF' },
  transmissao: { label: 'Transmissão',  cor: '#FFB830' },
  mancal:      { label: 'Mancal',       cor: '#7B5CFF' },
  vedacao:     { label: 'Vedação',       cor: '#00E5A0' },
  motor:       { label: 'Motor',         cor: '#FF4B6E' },
  estrutura:   { label: 'Estrutura',    cor: '#8A96A8' },
}

// Mapeamento: nome do mesh no GLB → chave interna
// ── Mapeamento para GLB exportado pelo Autodesk Inventor ─────────────────────
// Nomes vêm no formato "Nome:N" (ex: "Base Pump:1", "Centrifugal Pump:1")
// O parser remove o sufixo ":N" antes de comparar
export const MESH_MAP = [
  // ── Componentes principais do Inventor ────────────────────────────────────
  { fragment: 'base pump',          key: 'support'            },
  { fragment: 'centrifugal pump',   key: 'pump_casing'        },
  { fragment: 'coupling',           key: 'coupling'           },
  { fragment: 'moteur_wftp2',       key: 'motor_body'         },
  { fragment: 'moteur_wftp',        key: 'motor_body'         },
  { fragment: 'moteur',             key: 'motor_body'         },
  { fragment: 'motor',              key: 'motor_body'         },
  { fragment: 'pump protection',    key: 'pump_protection'    },

  // ── Nomes alternativos / sub-assemblies ───────────────────────────────────
  { fragment: 'pump casing',        key: 'pump_casing'        },
  { fragment: 'pump casin',         key: 'pump_casing'        },
  { fragment: 'pump impeller',      key: 'pump_impeller'      },
  { fragment: 'pump impellar',      key: 'pump_impeller'      },
  { fragment: 'impeller',           key: 'pump_impeller'      },
  { fragment: 'pump coupling',      key: 'pump_coupling'      },
  { fragment: 'shaft',              key: 'shaft'              },
  { fragment: 'house bearing',      key: 'house_bearing'      },
  { fragment: 'bearing housing',    key: 'house_bearing'      },
  { fragment: 'pump packing gland', key: 'pump_packing_gland' },
  { fragment: 'packing gland',      key: 'pump_packing_gland' },
  { fragment: 'gland',              key: 'pump_packing_gland' },
  { fragment: 'seal chamber',       key: 'seal_chamber'       },
  { fragment: 'pump lantern ring',  key: 'pump_lantern_ring'  },
  { fragment: 'lantern ring',       key: 'pump_lantern_ring'  },
  { fragment: 'lentern ring',       key: 'pump_lantern_ring'  },
  { fragment: 'pump packing set',   key: 'pump_packing_set'   },
  { fragment: 'packing set',        key: 'pump_packing_set'   },
  { fragment: 'packing',            key: 'pump_packing_set'   },
  { fragment: 'wear ring',          key: 'wear_ring'          },
  { fragment: 'bearing cover',      key: 'bearing_cover'      },
  { fragment: 'support',            key: 'support'            },
  { fragment: 'motor body',         key: 'motor_body'         },
  { fragment: 'motor casin',        key: 'motor_body'         },
  { fragment: 'fr motor cover',     key: 'fr_motor_cover'     },
  { fragment: 'r motor cover',      key: 'r_motor_cover'      },
  { fragment: 'motor rotor',        key: 'motor_rotor'        },

  // ── Parafusos e fixadores DIN (agrupados como 'parafusos') ───────────────
  { fragment: 'din 128',            key: 'parafusos'          },
  { fragment: 'din 933',            key: 'parafusos'          },
  { fragment: 'din 934',            key: 'parafusos'          },
  { fragment: 'din3760',            key: 'bearing_cover'      },
  { fragment: 'din_71412',          key: 'bearing_cover'      },
]
