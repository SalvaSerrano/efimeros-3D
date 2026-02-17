export const MODULES = [
    {
        id: 'escenario',
        name: 'Escenario',
        cost: 200,
        color: 0x3b82f6,
        type: 'box',
        size: { x: 3, y: 0.5, z: 3 },
        description: 'Plataforma 3x3m.'
    },
    {
        id: 'banco',
        name: 'Banco Público',
        cost: 120,
        color: 0x8b5cf6,
        type: 'box',
        size: { x: 1, y: 0.5, z: 4 },
        description: 'Banco 1x4m.'
    },
    {
        id: 'mesa',
        name: 'Mesa Alta',
        cost: 150,
        color: 0xf59e0b,
        type: 'cylinder',
        size: { radius: 0.75, height: 2 },
        description: ''
    },
    {
        id: 'silla',
        name: 'Silla',
        cost: 100,
        color: 0x10b981,
        type: 'box',
        size: { x: 1, y: 1.5, z: 1 },
        description: ''
    },
    {
        id: 'vega_baja',
        name: 'Vegetación Baja',
        cost: 30,
        color: 0x22c55e,
        type: 'cone',
        size: { radius: 1, height: 2 },
        description: ''
    },
    {
        id: 'vega_alta',
        name: 'Vegetación Alta',
        cost: 60,
        color: 0x15803d,
        type: 'cone',
        size: { radius: 1, height: 4 },
        description: ''
    },
    {
        id: 'globo_peq',
        name: 'Globo Pequeño',
        cost: 20,
        color: 0xec4899,
        type: 'balloon',
        size: { radius: 1, stringHeight: 3 },
        description: ''
    },
    {
        id: 'globo_gr',
        name: 'Globo Grande',
        cost: 30,
        color: 0xf43f5e,
        type: 'balloon',
        size: { radius: 1.5, stringHeight: 4 },
        description: ''
    },
    {
        id: 'sofa',
        name: 'Sofá',
        cost: 300,
        color: 0x4f46e5,
        type: 'sofa',
        size: { x: 2.5, y: 1, z: 1, backHeight: 2 },
        description: ''
    },
    {
        id: 'pared',
        name: 'Pared Vertical',
        cost: 100,
        color: 0x64748b,
        type: 'box',
        size: { x: 0.5, y: 4, z: 3 },
        description: 'Pared 0.5x3m, h=4m.'
    }
];

export const APP_CONFIG = {
    budgetLimit: 20000,
    gridSizeX: 30,
    gridSizeZ: 60,
    cellSize: 0.5
};
