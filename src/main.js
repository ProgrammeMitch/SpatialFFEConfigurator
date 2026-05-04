import * as THREE from 'three';

import { Engine } from './core/Engine.js';
import { globalEventBus } from './core/EventBus.js';
import { CatalogManager } from './managers/CatalogManager.js';
import { SidebarManager } from './ui/SideBarManager.js';
import { AssetManager } from './managers/AssetManager.js';
import { EnvironmentManager } from './managers/EnvironmentManager.js';
import { InteractionManager } from './interaction/InteractionManager.js';
import { StateManager } from './state/StateManager.js';
import { WebXRManager } from './core/WebXRManager.js';
import { HUD } from './ui/HUD.js';
import { PDFGenerator } from './export/PDFGenerator.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Springfield VR Planner: Initializing...');

    // 1. Grab the 3D container from index.html
    const container = document.getElementById('webgl-container');
    if (!container) {
        console.error('Fatal Error: WebGL container not found.');
        return;
    }

    // 2. Initialize the Core 3D Engine
    const engine = new Engine(container);

    // 3. Initialize Domain Managers (Placeholders for our next steps)
    const assetManager = new AssetManager(engine.scene);
    const catalogManager = new CatalogManager();
    const sidebarManager = new SidebarManager();
    const stateManager = new StateManager();
    const hud = new HUD();

    // const pdfGenerator = new PDFGenerator(engine, stateManager);
    const environmentManager = new EnvironmentManager(engine.scene, stateManager);

    // Initialize the Interaction Manager with the active camera (we will handle camera switching inside the manager)
    const interactionManager = new InteractionManager(
        engine.activeCamera,
        engine.scene,
        engine.renderer
    );

    const xrManager = new WebXRManager(engine.renderer, engine.scene, interactionManager);
    const pdfGenerator = new PDFGenerator(engine, stateManager);
    
    const orbitBtn = document.getElementById('orbit-toggle-btn');
    let isOrbiting = false;

    if (orbitBtn) {
        orbitBtn.addEventListener('click', () => {
            isOrbiting = !isOrbiting;

            // Tell the Engine to swap cameras
            engine.setOrbitMode(isOrbiting);

            // Tell the Interaction Manager to lock/unlock dragging
            globalEventBus.emit('ORBIT_TOGGLED', isOrbiting);

            // Update the button UI visually
            orbitBtn.innerText = isOrbiting ? "Exit 3D Orbit" : "Enable 3D Orbit";
            orbitBtn.style.background = isOrbiting ? "rgba(180,20,20,1)" : "#333";
        });
    }

    // Let's add a basic light so we can actually see the model when it loads
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(5, 10, 5);
    light.castShadow = true;
    light.shadow.camera.top = 2;
    light.shadow.camera.bottom = - 2;
    light.shadow.camera.right = 2;
    light.shadow.camera.left = - 2;
    light.shadow.mapSize.set(4096, 4096);
    engine.scene.add(light);
    engine.scene.add(new THREE.HemisphereLight(0x808080, 0x606060));

    // Listen for the catalog to finish loading just to prove it works
    globalEventBus.on('CATALOG_READY', (data) => {
        console.log('Main: The catalog is ready! Here is the first item:', data.items[0]);
    });

    // We pass engine.scene to managers that need to physically add things to the 3D world
    // const environmentManager = new EnvironmentManager(engine.scene); 

    // 4. Start the Render Loop
    // We pass an empty callback for now. In the future, this is where 
    // we tell the physics system or gaze tracking to calculate the next frame.
    engine.start(() => {
        if (engine.renderer.xr.isPresenting) {
            interactionManager.updateVRDrag();
        }
    });

    // Tell the Catalog Manager to go fetch the data
    catalogManager.loadCatalog();

    // 5. Broadcast that the system is online
    globalEventBus.emit('SYSTEM_READY', { status: 'Online' });
    console.log('Springfield VR Planner: Engine Running.');

    // --- DESKTOP ESCAPE HATCH ---
    // Allows desktop users trapped in VR mode to exit by hitting the Escape key.
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const xrSession = engine.renderer.xr.getSession();
            if (xrSession) {
                console.log('Force-quitting VR Session via Escape key...');
                xrSession.end(); // This triggers our resetCameraToDesktop() automatically!
            }
        }
    });
});


