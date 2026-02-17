import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MODULES, APP_CONFIG } from './modules.js';

class App3D {
    constructor() {
        this.container = document.getElementById('three-container');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f172a);

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
        this.setupCostEditor();
        this.animate();

        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupBudgetEdit() {
        const limitEl = document.getElementById('budget-limit-val');
        if (limitEl) {
            limitEl.onclick = () => {
                const newLimit = prompt('Introduce el nuevo límite de presupuesto:', APP_CONFIG.budgetLimit);
                if (newLimit && !isNaN(newLimit)) {
                    APP_CONFIG.budgetLimit = parseFloat(newLimit);
                    limitEl.innerText = APP_CONFIG.budgetLimit;
                    this.updateBudget(0);
                }
            };
        }
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
        const gridGroup = new THREE.Group();
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x1e293b });

        for (let x = -sizeX / 2; x <= sizeX / 2; x += cellSize) {
            const points = [
                new THREE.Vector3(x, 0, -sizeZ / 2),
                new THREE.Vector3(x, 0, sizeZ / 2)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            gridGroup.add(new THREE.Line(geometry, lineMaterial));
        }

        for (let z = -sizeZ / 2; z <= sizeZ / 2; z += cellSize) {
            const points = [
                new THREE.Vector3(-sizeX / 2, 0, z),
                new THREE.Vector3(sizeX / 2, 0, z)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            gridGroup.add(new THREE.Line(geometry, lineMaterial));
        }

        this.scene.add(gridGroup);

        const planeGeom = new THREE.PlaneGeometry(sizeX, sizeZ);
        planeGeom.rotateX(-Math.PI / 2);
        this.floor = new THREE.Mesh(
            planeGeom,
            new THREE.MeshBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.1 })
        );
        this.floor.name = 'floor';
        this.scene.add(this.floor);

        this.createFloorLabel("30m", 0, 0, sizeZ / 2 + 1);
        this.createFloorLabel("60m", -sizeX / 2 - 2.5, 0, 0);
    }

    createFloorLabel(text, x, y, z) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 64;

        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 36px Inter, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(x, y + 0.1, z);
        sprite.scale.set(4, 2, 1);
        this.scene.add(sprite);
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
                backgroundColor: '#0f172a',
                scale: 2,
                logging: false
            });

            const dataURL = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = 'efimeros-3d-design.png';
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
        if (event.key.toLowerCase() === 'r') {
            this.rotateActive();
        }
    }

    rotateActive() {
        const step = 45;
        if (this.selectedObject) {
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
        if (event.target.closest('.sidebar') || event.target.closest('.toolbar-left') || event.target.closest('.top-bar')) {
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
            card.innerHTML = `
                <div class="module-info">
                    <h3>${mod.name}</h3>
                    <div class="module-meta">
                        <span>${mod.description}</span>
                        <strong>${mod.cost} €</strong>
                    </div>
                </div>
            `;
            card.onclick = () => this.selectModule(mod, card);
            listContainer.appendChild(card);
        });
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
        document.getElementById('total-cost').innerText = `${this.totalCost} €`;

        const percent = Math.min((this.totalCost / APP_CONFIG.budgetLimit) * 100, 100);
        document.getElementById('budget-progress').style.width = `${percent}%`;

        if (this.totalCost > APP_CONFIG.budgetLimit) {
            document.getElementById('budget-progress').style.background = '#ef4444';
        } else {
            document.getElementById('budget-progress').style.background = '#38bdf8';
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
