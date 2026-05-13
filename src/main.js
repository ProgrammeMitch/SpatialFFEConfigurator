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

    const xrManager = new WebXRManager(engine.renderer, engine.scene, interactionManager, engine.vrRig);
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

    // --- THE CLOUD SAVE & RESUME ENGINE ---

    let currentEnvironmentId = null;
    globalEventBus.on('ROOM_SELECTED', (roomData) => {
        currentEnvironmentId = roomData.id;
    });

    // 1. The Cloud Save Sequence
    const saveBtn = document.getElementById('save-session-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            console.log("Main: Uploading session state to the cloud...");

            // Optional: Change button text so the user knows it's working
            const originalText = saveBtn.innerText;
            saveBtn.innerText = "Saving to Cloud...";
            saveBtn.disabled = true;

            const furnitureItems = interactionManager.getFurnitureItems();

            const layoutData = {
                environmentId: currentEnvironmentId,
                furniture: furnitureItems.map(item => ({
                    id: item.userData.id,
                    position: { x: item.position.x, y: item.position.y, z: item.position.z },
                    rotationY: item.rotation.y
                }))
            };

            // Bulletproof Key Scrubber
            const rawKey = import.meta.env.VITE_JSONBIN_KEY || "";
            const cleanKey = rawKey.replace(/['"]/g, '').trim();

            // --- THE SMART SAVE LOGIC (POST vs PUT) ---
            const urlParams = new URLSearchParams(window.location.search);
            const existingSessionId = urlParams.get('session');

            // Default to POST (Create a brand new bin)
            let endpoint = 'https://api.jsonbin.io/v3/b';
            let requestMethod = 'POST';

            // If we are already inside a session, switch to PUT (Overwrite the existing bin)
            if (existingSessionId) {
                endpoint = `https://api.jsonbin.io/v3/b/${existingSessionId}`;
                requestMethod = 'PUT';
            }

            try {
                // Send the blueprint to JSONBin
                const response = await fetch(endpoint, {
                    method: requestMethod,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Master-Key': cleanKey,
                        'X-Bin-Private': 'false'
                    },
                    body: JSON.stringify(layoutData)
                });

                const result = await response.json();

                // Safety Check
                if (!response.ok) {
                    throw new Error(`JSONBin Error: ${result.message || 'Unauthorized or bad request'}`);
                }

                // If it was a brand new POST, grab the new ID and update the URL
                if (requestMethod === 'POST') {
                    const newSessionId = result.metadata.id;
                    const newUrl = `${window.location.pathname}?session=${newSessionId}`;
                    window.history.pushState({ path: newUrl }, '', newUrl);

                    alert(`New Session Created!\n\nLink: ${window.location.href}\n\nYou can now share this URL. Future saves will update this exact link.`);
                } else {
                    // It was a PUT request, so the URL is already correct!
                    alert(`Session Updated Successfully!\n\nAnyone who refreshes this link will now see your latest changes.`);
                }

            } catch (error) {
                console.error("Cloud Save Failed:", error);
                alert(`Failed to save session to the cloud.\nReason: ${error.message}`);
            } finally {
                // Reset the button
                saveBtn.innerText = originalText;
                saveBtn.disabled = false;
            }
        });
    }

    // 2. The Cloud Boot Sequence
    globalEventBus.on('CATALOG_READY', async (data) => {
        console.log('Main: Catalog ready! Checking URL for cloud sessions...');

        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session');
        let clientPresetBlueprint = null;

        if (sessionId) {
            console.log(`Main: Found Session ID ${sessionId}. Fetching from cloud...`);
            try {
                // Fetch the specific blueprint from JSONBin
                const response = await fetch(`https://api.jsonbin.io/v3/b/${sessionId}`, {
                    method: 'GET',
                    headers: {
                        'X-Master-Key': import.meta.env.VITE_JSONBIN_KEY
                    }
                });

                if (response.ok) {
                    const result = await response.json();
                    clientPresetBlueprint = result.record; // JSONBin wraps your data inside a 'record' object
                    console.log(`Main: Successfully downloaded blueprint from cloud.`);
                } else {
                    console.warn(`Main: Cloud session ${sessionId} not found or expired.`);
                }
            } catch (error) {
                console.error("Cloud Load Failed:", error);
            }
        }

        if (!clientPresetBlueprint) return;

        // --- RESTORE THE SAVED SESSION ---
        const targetRoom = data.environments.find(env => env.id === clientPresetBlueprint.environmentId);
        if (targetRoom) {
            globalEventBus.emit('ROOM_SELECTED', targetRoom);
        }

        let hasLoadedPreset = false;

        globalEventBus.on('ENVIRONMENT_READY', () => {
            if (hasLoadedPreset) return;
            hasLoadedPreset = true;

            console.log('Main: Room loaded. Restoring cloud layout...');

            clientPresetBlueprint.furniture.forEach(itemData => {
                const catalogItem = data.items.find(item => item.id === itemData.id);
                if (catalogItem) {
                    assetManager.loadFurniture(catalogItem, {
                        position: new THREE.Vector3(itemData.position.x, itemData.position.y, itemData.position.z),
                        rotationY: itemData.rotationY
                    });
                }
            });
        });
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


