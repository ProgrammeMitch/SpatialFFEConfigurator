import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'; // NEW: Import the Draco decoder
import { globalEventBus } from '../core/EventBus.js';

export class AssetManager {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();

        // NEW: Initialize the Draco Decoder to handle the hyper-compressed cloud geometry
        const dracoLoader = new DRACOLoader();
        // We use unpkg CDN so you don't have to download/host the WASM decoder files locally
        dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
        this.loader.setDRACOLoader(dracoLoader);

        // Listen for new furniture selections from the sidebar
        globalEventBus.on('ITEM_SELECTED', (itemData) => {
            this.loadFurniture(itemData);
        });
    }

    async loadFurniture(itemData, presetTransform = null) {
        try {
            console.log(`AssetManager: Spawning new ${itemData.name}...`);

            let finalModelPath = itemData.modelPath;

            // NEW: The Cloud Routing Check
            // If the path does NOT start with 'http', we assume it's a local Vite asset
            if (!finalModelPath.startsWith('http')) {
                let cleanPath = finalModelPath.replace(/^\.\//, '');
                if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
                finalModelPath = `${import.meta.env.BASE_URL}${cleanPath}`;
            }

            // 1. Load using the dynamically routed path (Cloud or Local)
            const gltf = await this.loader.loadAsync(finalModelPath);
            const model = gltf.scene;

            // 2. Attach the BIM Metadata directly to the 3D Object
            // This is CRITICAL so the InteractionManager and HUD can read it later
            model.userData = {
                ...itemData,
                isFurniture: true // Tells the Raycaster this is draggable
            };

            // 3. Set a unique name based on the UUID to avoid naming collisions
            model.name = `${itemData.id}_${THREE.MathUtils.generateUUID().substring(0, 8)}`;

            if (presetTransform) {
                // If the system provided a blueprint, place it exactly where it goes!
                model.position.copy(presetTransform.position);
                model.rotation.y = presetTransform.rotationY;
            } else {
                // If the user clicked it from the sidebar, drop it at the center
                model.position.set(0, 0, 0);
            }

            this.scene.add(model);

            // 5. Broadcast that a NEW item has entered the scene
            // We pass the actual 3D object and its BIM data to the StateManager
            globalEventBus.emit('FURNITURE_PLACED', {
                object: model,
                bimData: itemData,
                position: model.position.clone()
            });

            console.log(`AssetManager: ${itemData.name} added to scene.`);

        } catch (error) {
            console.error(`AssetManager: Failed to load furniture model at ${itemData.modelPath}`, error);
        }
    }
}