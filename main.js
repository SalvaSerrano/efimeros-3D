import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MODULES, APP_CONFIG } from './modules.js';

const CURRENCY_RATES = {
    EUR: { symbol: '€', rate: 1.0 },
    USD: { symbol: '$', rate: 1.1 },
    PEN: { symbol: 'S/.', rate: 4.0 },
    COP: { symbol: '$', rate: 4500.0 },
    DOP: { symbol: 'RD$', rate: 65.0 },
    MXN: { symbol: '$', rate: 20.0 },
    ARS: { symbol: '$', rate: 1000.0 },
    CLP: { symbol: '$', rate: 1000.0 }
};

class App3D {
    constructor() {
        this.container = document.getElementById('three-container');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf1f5f9);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(40, 40, 40);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true // Required for screenshots
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        this.controls = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.ghostObject = null;
        this.activeModule = null;
        this.activeTool = 'select';
        this.selectedObject = null;
        this.currentRotation = 0;
        this.placedObjects = [];
        this.totalCost = 0;
        this.undoStack = [];
        this.redoStack = [];

        this.gridGroup = null;
        this.currency = 'EUR';
        this.currencySymbol = '€';
        this.baseBudgetLimit = APP_CONFIG.budgetLimit;

        // Store original base cost for each module
        MODULES.forEach(mod => {
            mod.baseCost = mod.cost;
        });

        this.setupFileUploader();

        this.init();
    }

    init() {
        this.setupLights();
        this.setupGrid();
        this.setupControls();
        this.setupEventListeners();
        this.setupToolbar();
        this.renderModulesUI();
        this.setupBudgetEdit();
        this.setupCurrencySelect();
        this.setupCostEditor();
        this.setupDimensionSliders();
        this.setupHistory();
        this.animate();

        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupBudgetEdit() {
        const limitEl = document.getElementById('budget-limit-val');
        if (limitEl) {
            limitEl.value = APP_CONFIG.budgetLimit;
            limitEl.addEventListener('input', () => {
                const newLimit = parseFloat(limitEl.value);
                if (!isNaN(newLimit) && newLimit >= 0) {
                    APP_CONFIG.budgetLimit = newLimit;
                    const rate = CURRENCY_RATES[this.currency].rate;
                    this.baseBudgetLimit = newLimit / rate;
                    this.updateBudget(0);
                }
            });
        }
    }

    setupFileUploader() {
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = '.stl,.obj';
        this.fileInput.style.display = 'none';
        document.body.appendChild(this.fileInput);
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }

    triggerFileUpload() {
        this.fileInput.value = '';
        this.fileInput.click();
    }

    setupHistory() {
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');

        if (btnUndo) btnUndo.onclick = () => this.undo();
        if (btnRedo) btnRedo.onclick = () => this.redo();

        this.updateHistoryButtons();
    }

    saveState() {
        const snapshot = this.placedObjects.map(obj => ({
            moduleId: obj.module.id,
            position: obj.mesh.position.clone(),
            rotationY: obj.mesh.rotation.y
        }));

        this.undoStack.push(snapshot);
        if (this.undoStack.length > 30) {
            this.undoStack.shift();
        }

        this.redoStack = [];
        this.updateHistoryButtons();
    }

    undo() {
        if (this.undoStack.length === 0) return;

        const currentSnapshot = this.placedObjects.map(obj => ({
            moduleId: obj.module.id,
            position: obj.mesh.position.clone(),
            rotationY: obj.mesh.rotation.y
        }));
        this.redoStack.push(currentSnapshot);

        const prevSnapshot = this.undoStack.pop();
        this.restoreState(prevSnapshot);
        this.updateHistoryButtons();
    }

    redo() {
        if (this.redoStack.length === 0) return;

        const currentSnapshot = this.placedObjects.map(obj => ({
            moduleId: obj.module.id,
            position: obj.mesh.position.clone(),
            rotationY: obj.mesh.rotation.y
        }));
        this.undoStack.push(currentSnapshot);

        const nextSnapshot = this.redoStack.pop();
        this.restoreState(nextSnapshot);
        this.updateHistoryButtons();
    }

    restoreState(snapshot) {
        this.deselectObject();

        this.placedObjects.forEach(obj => {
            this.scene.remove(obj.mesh);
        });
        this.placedObjects = [];

        snapshot.forEach(item => {
            const mod = MODULES.find(m => m.id === item.moduleId);
            if (mod) {
                const originalRotation = this.currentRotation;
                this.currentRotation = THREE.MathUtils.radToDeg(item.rotationY);

                const mesh = this.createObjectGroup(mod);
                mesh.position.copy(item.position);
                this.scene.add(mesh);

                this.placedObjects.push({ mesh, module: mod });

                this.currentRotation = originalRotation;
            }
        });

        this.recalculateBudget();
        this.refreshChecklist();
    }

    updateHistoryButtons() {
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');

        if (btnUndo) {
            btnUndo.disabled = this.undoStack.length === 0;
        }
        if (btnRedo) {
            btnRedo.disabled = this.redoStack.length === 0;
        }
    }

    handleFileSelect(event) {
        console.log("handleFileSelect triggered", event);
        const file = event.target.files[0];
        if (!file) {
            console.log("No file selected");
            return;
        }

        console.log("Selected file:", file.name, file.size);
        const extension = file.name.split('.').pop().toLowerCase();
        if (extension !== 'stl' && extension !== 'obj') {
            alert('Por favor, selecciona un archivo en formato .stl o .obj');
            return;
        }

        const defaultName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const finalName = defaultName;
        console.log("Module name set automatically to filename:", finalName);

        const reader = new FileReader();

        if (extension === 'stl') {
            console.log("Reading STL file...");
            reader.onload = (e) => {
                console.log("STL file read completed");
                try {
                    const contents = e.target.result;
                    console.log("Parsing STL file...");
                    const loader = new STLLoader();
                    const geometry = loader.parse(contents);
                    console.log("STL parsed successfully:", geometry);

                    const newMod = {
                        id: `custom_${Date.now()}`,
                        name: finalName,
                        cost: 100,
                        baseCost: 100,
                        color: 0xff4b0f,
                        type: 'custom-stl',
                        description: 'Modelo STL cargado',
                        size: { x: 3, y: 3, z: 3 },
                        customGeometry: geometry
                    };

                    const currentRate = CURRENCY_RATES[this.currency].rate;
                    newMod.cost = Math.round(newMod.baseCost * currentRate);

                    MODULES.push(newMod);
                    console.log("Custom module added to MODULES:", newMod);
                    this.renderModulesUI();
                } catch (err) {
                    console.error("Error parsing/loading STL:", err);
                    alert('Error al procesar el archivo STL: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        } else if (extension === 'obj') {
            console.log("Reading OBJ file...");
            reader.onload = (e) => {
                console.log("OBJ file read completed");
                try {
                    const contents = e.target.result;
                    console.log("Parsing OBJ file...");
                    const loader = new OBJLoader();
                    const group = loader.parse(contents);
                    console.log("OBJ parsed successfully:", group);

                    const newMod = {
                        id: `custom_${Date.now()}`,
                        name: finalName,
                        cost: 100,
                        baseCost: 100,
                        color: 0xff4b0f,
                        type: 'custom-obj',
                        description: 'Modelo OBJ cargado',
                        size: { x: 3, y: 3, z: 3 },
                        customGroup: group
                    };

                    const currentRate = CURRENCY_RATES[this.currency].rate;
                    newMod.cost = Math.round(newMod.baseCost * currentRate);

                    MODULES.push(newMod);
                    console.log("Custom module added to MODULES:", newMod);
                    this.renderModulesUI();
                } catch (err) {
                    console.error("Error parsing/loading OBJ:", err);
                    alert('Error al procesar el archivo OBJ: ' + err.message);
                }
            };
            reader.readAsText(file);
        }
    }

    setupCurrencySelect() {
        const currencyEl = document.getElementById('currency-select');
        if (currencyEl) {
            currencyEl.value = this.currency;
            currencyEl.onchange = (e) => {
                this.setCurrency(e.target.value);
            };
        }
    }

    setCurrency(newCurrency) {
        if (this.currency === newCurrency) return;

        this.currency = newCurrency;
        const currencyData = CURRENCY_RATES[newCurrency];
        this.currencySymbol = currencyData.symbol;
        const rate = currencyData.rate;

        // Update budget limit
        APP_CONFIG.budgetLimit = Math.round(this.baseBudgetLimit * rate);
        const limitEl = document.getElementById('budget-limit-val');
        if (limitEl) {
            limitEl.value = APP_CONFIG.budgetLimit;
        }

        const budgetCurrencySymbolEl = document.getElementById('budget-currency-symbol');
        if (budgetCurrencySymbolEl) {
            budgetCurrencySymbolEl.innerText = this.currencySymbol;
        }

        // Update module costs
        MODULES.forEach(mod => {
            mod.cost = Math.round(mod.baseCost * rate);
        });

        // Recalculate and update budget UI
        this.recalculateBudget();
        this.renderModulesUI();
    }

    setupCostEditor() {
        const btnCosts = document.getElementById('btn-costs');
        const modal = document.getElementById('cost-editor-modal');
        const btnCancel = document.getElementById('btn-cancel-costs');
        const btnSave = document.getElementById('btn-save-costs');

        if (btnCosts) btnCosts.onclick = () => this.openCostEditor();
        if (btnCancel) btnCancel.onclick = () => modal.close();
        if (btnSave) btnSave.onclick = () => this.saveCosts();

        if (modal) {
            modal.addEventListener('click', (e) => {
                const rect = modal.getBoundingClientRect();
                if (e.target === modal) modal.close();
            });
        }
    }

    openCostEditor() {
        const modal = document.getElementById('cost-editor-modal');
        const list = document.getElementById('cost-list');
        list.innerHTML = '';
        MODULES.forEach(mod => {
            const item = document.createElement('div');
            item.className = 'cost-item';
            item.innerHTML = `<label>${mod.name}</label><input type="number" data-id="${mod.id}" value="${mod.cost}" min="0" step="1" />`;
            list.appendChild(item);
        });
        modal.showModal();
    }

    saveCosts() {
        const inputs = document.querySelectorAll('#cost-list input');
        inputs.forEach(input => {
            const id = input.getAttribute('data-id');
            const newCost = parseFloat(input.value);
            const mod = MODULES.find(m => m.id === id);
            if (mod && !isNaN(newCost)) mod.cost = newCost;
        });
        this.recalculateBudget();
        this.renderModulesUI();
        document.getElementById('cost-editor-modal').close();
    }

    recalculateBudget() {
        this.totalCost = 0;
        this.placedObjects.forEach(obj => { this.totalCost += obj.module.cost; });
        this.updateBudget(0);
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(20, 40, 20);
        this.scene.add(dirLight);
    }

    setupGrid() {
        const sizeX = APP_CONFIG.gridSizeX;
        const sizeZ = APP_CONFIG.gridSizeZ;
        const cellSize = 0.5;

        // Custom Rectangular Grid
        this.gridGroup = new THREE.Group();
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0xcbd5e1 });

        for (let x = -sizeX / 2; x <= sizeX / 2; x += cellSize) {
            const points = [
                new THREE.Vector3(x, 0, -sizeZ / 2),
                new THREE.Vector3(x, 0, sizeZ / 2)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            this.gridGroup.add(new THREE.Line(geometry, lineMaterial));
        }

        for (let z = -sizeZ / 2; z <= sizeZ / 2; z += cellSize) {
            const points = [
                new THREE.Vector3(-sizeX / 2, 0, z),
                new THREE.Vector3(sizeX / 2, 0, z)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            this.gridGroup.add(new THREE.Line(geometry, lineMaterial));
        }

        this.scene.add(this.gridGroup);

        const planeGeom = new THREE.PlaneGeometry(sizeX, sizeZ);
        planeGeom.rotateX(-Math.PI / 2);
        this.floor = new THREE.Mesh(
            planeGeom,
            new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.08 })
        );
        this.floor.name = 'floor';
        this.scene.add(this.floor);

    }

    rebuildGrid() {
        if (this.gridGroup) this.scene.remove(this.gridGroup);
        if (this.floor) this.scene.remove(this.floor);
        this.setupGrid();
    }

    setupDimensionSliders() {
        const sliderX = document.getElementById('slider-x');
        const sliderZ = document.getElementById('slider-z');
        const valX = document.getElementById('slider-x-val');
        const valZ = document.getElementById('slider-z-val');

        if (sliderX) {
            sliderX.value = APP_CONFIG.gridSizeX;
            if (valX) valX.textContent = APP_CONFIG.gridSizeX;
            sliderX.addEventListener('input', (e) => {
                const newVal = parseFloat(e.target.value);
                APP_CONFIG.gridSizeX = newVal;
                if (valX) valX.textContent = newVal;
                this.rebuildGrid();
            });
        }

        if (sliderZ) {
            sliderZ.value = APP_CONFIG.gridSizeZ;
            if (valZ) valZ.textContent = APP_CONFIG.gridSizeZ;
            sliderZ.addEventListener('input', (e) => {
                const newVal = parseFloat(e.target.value);
                APP_CONFIG.gridSizeZ = newVal;
                if (valZ) valZ.textContent = newVal;
                this.rebuildGrid();
            });
        }
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.mouseButtons = {
            LEFT: null,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.ROTATE
        };

        // Explicitly disable Shift + Click panning to ensure only Middle Click works
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.shiftKey) {
                // If shift is pressed, we don't want OrbitControls 
                // to interpret any click as a Pan action.
                e.stopImmediatePropagation();
            }
        }, true);
    }

    setupEventListeners() {
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    setupToolbar() {
        const tools = ['select', 'edit', 'delete'];
        tools.forEach(toolId => {
            const btn = document.getElementById(`btn-${toolId}`);
            if (btn) {
                btn.onclick = () => this.setTool(toolId);
            }
        });

        const rotateBtn = document.getElementById('btn-rotate');
        if (rotateBtn) rotateBtn.onclick = () => this.rotateActive();

        const clearBtn = document.getElementById('btn-clear');
        if (clearBtn) clearBtn.onclick = () => this.clearAll();

        const screenBtn = document.getElementById('btn-screenshot');
        if (screenBtn) screenBtn.onclick = () => this.takeScreenshot();
    }

    clearAll() {
        if (confirm("¿Estás seguro de que deseas borrar todo el diseño?")) {
            this.saveState();
            this.deselectObject();
            this.placedObjects.forEach(obj => {
                this.scene.remove(obj.mesh);
            });
            this.placedObjects = [];
            this.totalCost = 0;
            this.updateBudget(0);
            this.refreshChecklist();
        }
    }

    async takeScreenshot() {
        try {
            // Dynamically import html2canvas
            const html2canvas = (await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm')).default;

            const canvas = await html2canvas(document.body, {
                backgroundColor: '#f1f5f9',
                scale: 2,
                logging: false
            });

            const dataURL = canvas.toDataURL('image/jpeg', 0.95);
            const link = document.createElement('a');
            link.download = 'efimeros-3d-design.jpg';
            link.href = dataURL;
            link.click();
        } catch (err) {
            console.error("Error al capturar pantalla:", err);
            alert("No se pudo realizar la captura. Asegúrate de tener conexión a internet.");
        }
    }

    setTool(toolId) {
        this.activeTool = toolId;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.id === `btn-${toolId}`);
        });

        document.getElementById('active-mode').innerText = `Modo: ${toolId.charAt(0).toUpperCase() + toolId.slice(1)}`;

        if (toolId !== 'select') this.cancelPlacement();
        if (toolId !== 'select' && toolId !== 'edit') this.deselectObject();
    }

    onKeyDown(event) {
        if (event.key === 'Escape') {
            this.cancelPlacement();
            this.deselectObject();
            this.setTool('select');
        }
        if (event.ctrlKey && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            this.undo();
        }
        if (event.ctrlKey && event.key.toLowerCase() === 'y') {
            event.preventDefault();
            this.redo();
        }
        if (event.key.toLowerCase() === 'r') {
            this.rotateActive();
        }
    }

    rotateActive() {
        const step = 45;
        if (this.selectedObject) {
            this.saveState();
            this.selectedObject.mesh.rotation.y += THREE.MathUtils.degToRad(step);
            this.highlightObject(this.selectedObject.mesh, true);
        } else if (this.ghostObject) {
            this.currentRotation = (this.currentRotation + step) % 360;
            this.ghostObject.rotation.y = THREE.MathUtils.degToRad(this.currentRotation);
        }
    }

    cancelPlacement() {
        this.activeModule = null;
        this.removeGhost();
        this.currentRotation = 0;
        document.querySelectorAll('.module-card').forEach(c => c.classList.remove('active'));
    }

    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        if (this.activeModule && this.ghostObject) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.floor);

            if (intersects.length > 0) {
                const pt = intersects[0].point;
                let yPos = 0;

                if (this.activeModule.type === 'sofa') {
                    yPos = this.activeModule.size.y / 2;
                } else if (this.activeModule.type === 'box') {
                    yPos = this.activeModule.size.y / 2;
                } else if (this.activeModule.type === 'cylinder' || this.activeModule.type === 'cone') {
                    yPos = this.activeModule.size.height / 2;
                } else if (this.activeModule.type === 'custom-stl' || this.activeModule.type === 'custom-obj') {
                    yPos = 0;
                }

                this.ghostObject.position.set(
                    Math.round(pt.x * 2) / 2,
                    yPos,
                    Math.round(pt.z * 2) / 2
                );
            }
        }
    }

    onMouseDown(event) {
        if (event.target.closest('.sidebar') || event.target.closest('.toolbar-left') || event.target.closest('.top-bar') || event.target.closest('.dimension-panel')) {
            return;
        }

        if (event.button === 0) {
            if (this.activeModule) {
                this.placeObject();
            } else if (this.activeTool === 'delete') {
                this.deleteObject();
            } else if (this.activeTool === 'select' || this.activeTool === 'edit') {
                this.selectObject();
            }
        }
    }

    selectObject() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const objectsToIntersect = this.placedObjects.map(o => o.mesh);
        const intersects = this.raycaster.intersectObjects(objectsToIntersect, true);

        if (intersects.length > 0) {
            let hit = intersects[0].object;
            let foundItem = null;
            while (hit) {
                foundItem = this.placedObjects.find(o => o.mesh === hit);
                if (foundItem) break;
                hit = hit.parent;
            }

            if (foundItem) {
                this.deselectObject();
                this.selectedObject = foundItem;
                this.highlightObject(foundItem.mesh, true);
                document.getElementById('active-mode').innerText = `Seleccionado: ${foundItem.module.name}`;
            } else {
                this.deselectObject();
            }
        } else {
            this.deselectObject();
        }
    }

    deselectObject() {
        if (this.selectedObject) {
            this.highlightObject(this.selectedObject.mesh, false);
            this.selectedObject = null;
            if (this.activeTool === 'select') {
                document.getElementById('active-mode').innerText = 'Modo: Selección';
            }
        }
    }

    highlightObject(group, active) {
        group.traverse(child => {
            if (child.isMesh && child.material.emissive) {
                child.material.emissive.setHex(active ? 0x444444 : 0x000000);
            }
        });
    }

    deleteObject() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const objectsToIntersect = this.placedObjects.map(o => o.mesh);
        const intersects = this.raycaster.intersectObjects(objectsToIntersect, true);

        if (intersects.length > 0) {
            let hit = intersects[0].object;
            let foundItem = null;
            while (hit) {
                foundItem = this.placedObjects.find(o => o.mesh === hit);
                if (foundItem) break;
                hit = hit.parent;
            }

            if (foundItem) {
                this.saveState();
                if (this.selectedObject === foundItem) this.deselectObject();
                this.scene.remove(foundItem.mesh);
                this.updateBudget(-foundItem.module.cost);
                this.placedObjects = this.placedObjects.filter(o => o !== foundItem);
                this.refreshChecklist();
            }
        }
    }

    renderModulesUI() {
        const listContainer = document.getElementById('module-list');
        listContainer.innerHTML = '';
        MODULES.forEach(mod => {
            const card = document.createElement('div');
            card.className = 'module-card';
            const hexColor = '#' + mod.color.toString(16).padStart(6, '0');
            const isCustom = mod.id.startsWith('custom_');
            card.innerHTML = `
                <div class="module-info">
                    <div class="module-header">
                        <div class="module-title-container">
                            ${isCustom ? `<h3 class="custom-title" title="Clic para cambiar nombre">${mod.name} <span class="edit-pencil-icon">✏️</span></h3>` : `<h3>${mod.name}</h3>`}
                        </div>
                        <input type="color" class="module-color-picker" data-id="${mod.id}" value="${hexColor}" title="Elegir color">
                    </div>
                    <div class="module-meta">
                        <span>${mod.description}</span>
                        <strong>${mod.cost} ${this.currencySymbol}</strong>
                    </div>
                </div>
            `;

            // Card click handles module selection
            card.onclick = () => this.selectModule(mod, card);

            // Click handler for custom modules title to rename
            if (isCustom) {
                const titleEl = card.querySelector('.custom-title');
                if (titleEl) {
                    titleEl.onclick = (e) => {
                        e.stopPropagation();
                        // Create input field
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = mod.name;
                        input.className = 'rename-inline-input';

                        // Prevent selecting the card on click
                        input.onclick = (ev) => ev.stopPropagation();
                        input.onkeydown = (ev) => {
                            if (ev.key === 'Enter') {
                                mod.name = input.value.trim() || mod.name;
                                this.renderModulesUI();
                            } else if (ev.key === 'Escape') {
                                this.renderModulesUI();
                            }
                        };
                        input.onblur = () => {
                            mod.name = input.value.trim() || mod.name;
                            this.renderModulesUI();
                        };

                        titleEl.replaceWith(input);
                        input.focus();
                        input.select();
                    };
                }
            }

            // Handle color picker change
            const picker = card.querySelector('.module-color-picker');
            if (picker) {
                picker.onclick = (e) => e.stopPropagation();
                picker.oninput = (e) => {
                    const newHex = e.target.value;
                    const colorVal = parseInt(newHex.replace('#', '0x'), 16);
                    mod.color = colorVal;

                    // Update active ghost if it matches this module type
                    if (this.activeModule && this.activeModule.id === mod.id) {
                        this.createGhost(mod);
                    }

                    // Update all placed objects of this type
                    this.placedObjects.forEach(obj => {
                        if (obj.module.id === mod.id) {
                            obj.mesh.traverse(child => {
                                if (child.isMesh) {
                                    if (child.material) {
                                        child.material = child.material.clone();
                                        child.material.color.setHex(colorVal);
                                    }
                                }
                            });
                        }
                    });
                };
            }

            listContainer.appendChild(card);
        });

        // Append the static "+" Add Custom Module card
        const addCard = document.createElement('div');
        addCard.className = 'module-card add-custom-card';
        addCard.innerHTML = `
            <div class="add-custom-content">
                <span class="add-icon">+</span>
                <span>Cargar STL / OBJ</span>
            </div>
        `;
        addCard.onclick = () => this.triggerFileUpload();
        listContainer.appendChild(addCard);
    }

    selectModule(module, cardElement) {
        this.deselectObject();
        document.querySelectorAll('.module-card').forEach(c => c.classList.remove('active'));

        if (this.activeModule && this.activeModule.id === module.id) {
            this.activeModule = null;
            this.removeGhost();
            document.getElementById('active-mode').innerText = 'Modo: Selección';
            return;
        }

        this.activeModule = module;
        this.currentRotation = 0;
        cardElement.classList.add('active');
        document.getElementById('active-mode').innerText = `Colocando: ${module.name}`;

        this.createGhost(module);
    }

    createGhost(module) {
        this.removeGhost();
        this.ghostObject = this.createObjectGroup(module);
        this.ghostObject.traverse(child => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.material.transparent = true;
                child.material.opacity = 0.5;
            }
        });
        this.scene.add(this.ghostObject);
    }

    createObjectGroup(module) {
        const group = new THREE.Group();

        if (module.type === 'balloon') {
            const stringGeom = new THREE.CylinderGeometry(0.02, 0.02, module.size.stringHeight, 8);
            const stringMat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
            const string = new THREE.Mesh(stringGeom, stringMat);
            string.position.y = module.size.stringHeight / 2;
            group.add(string);

            const sphereGeom = new THREE.SphereGeometry(module.size.radius, 32, 32);
            const sphereMat = new THREE.MeshPhongMaterial({ color: module.color });
            const sphere = new THREE.Mesh(sphereGeom, sphereMat);
            sphere.position.y = module.size.stringHeight + module.size.radius * 0.8;
            group.add(sphere);
        } else if (module.type === 'sofa') {
            const baseGeom = new THREE.BoxGeometry(module.size.x, module.size.y, module.size.z);
            const baseMat = new THREE.MeshPhongMaterial({ color: module.color });
            const base = new THREE.Mesh(baseGeom, baseMat);
            group.add(base);

            const backGeom = new THREE.BoxGeometry(module.size.x, module.size.backHeight, 0.2);
            const backMat = new THREE.MeshPhongMaterial({ color: module.color });
            const back = new THREE.Mesh(backGeom, backMat);
            back.position.set(0, (module.size.backHeight - module.size.y) / 2, -module.size.z / 2 + 0.1);
            group.add(back);
        } else if (module.type === 'custom-stl') {
            const geom = module.customGeometry.clone();
            geom.center();
            geom.computeBoundingBox();
            const size = new THREE.Vector3();
            geom.boundingBox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                const scaleFactor = 3 / maxDim;
                geom.scale(scaleFactor, scaleFactor, scaleFactor);
            }
            const mat = new THREE.MeshPhongMaterial({ color: module.color });
            const mesh = new THREE.Mesh(geom, mat);
            geom.computeBoundingBox();
            mesh.position.y = -geom.boundingBox.min.y;
            group.add(mesh);
        } else if (module.type === 'custom-obj') {
            const customGroup = module.customGroup.clone();
            const box = new THREE.Box3().setFromObject(customGroup);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);

            customGroup.traverse(child => {
                if (child.isMesh) {
                    child.position.sub(center);
                }
            });

            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                const scaleFactor = 3 / maxDim;
                customGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
            }

            customGroup.traverse(child => {
                if (child.isMesh) {
                    child.material = new THREE.MeshPhongMaterial({ color: module.color });
                }
            });

            const newBox = new THREE.Box3().setFromObject(customGroup);
            customGroup.position.y = -newBox.min.y;
            group.add(customGroup);
        } else {
            const geom = this.getGeometry(module);
            const mat = new THREE.MeshPhongMaterial({ color: module.color });
            const mesh = new THREE.Mesh(geom, mat);
            group.add(mesh);
        }

        group.rotation.y = THREE.MathUtils.degToRad(this.currentRotation);
        return group;
    }

    getGeometry(module) {
        if (module.type === 'box') {
            return new THREE.BoxGeometry(module.size.x, module.size.y, module.size.z);
        } else if (module.type === 'cylinder') {
            return new THREE.CylinderGeometry(module.size.radius, module.size.radius, module.size.height, 32);
        } else if (module.type === 'cone') {
            return new THREE.ConeGeometry(module.size.radius, module.size.height, 32);
        }
        return new THREE.BoxGeometry(1, 1, 1);
    }

    removeGhost() {
        if (this.ghostObject) {
            this.scene.remove(this.ghostObject);
            this.ghostObject = null;
        }
    }

    placeObject() {
        if (!this.ghostObject) return;

        this.saveState();

        const mod = this.activeModule;
        const mesh = this.createObjectGroup(mod);

        mesh.position.copy(this.ghostObject.position);
        mesh.rotation.copy(this.ghostObject.rotation);
        this.scene.add(mesh);

        this.placedObjects.push({ mesh, module: mod });
        this.updateBudget(mod.cost);
        this.updateChecklist(mod.id);
    }

    updateBudget(cost) {
        this.totalCost += cost;
        document.getElementById('total-cost').innerHTML = `${this.totalCost} <span id="total-cost-currency-symbol">${this.currencySymbol}</span>`;

        const percent = Math.min((this.totalCost / APP_CONFIG.budgetLimit) * 100, 100);
        document.getElementById('budget-progress').style.width = `${percent}%`;

        if (this.totalCost > APP_CONFIG.budgetLimit) {
            document.getElementById('budget-progress').style.background = '#ef4444';
        } else {
            document.getElementById('budget-progress').style.background = 'var(--accent-color)';
        }
    }

    updateChecklist(moduleId) {
        const item = document.querySelector(`.check-item[data-id="${moduleId}"]`);
        if (item) item.classList.add('done');
    }

    refreshChecklist() {
        document.querySelectorAll('.check-item').forEach(item => item.classList.remove('done'));
        this.placedObjects.forEach(obj => {
            this.updateChecklist(obj.module.id);
        });
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

new App3D();
