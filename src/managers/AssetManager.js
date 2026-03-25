import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { globalEventBus } from '../core/EventBus.js';

export class AssetManager {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();

        // Listen for new furniture selections from the sidebar
        globalEventBus.on('ITEM_SELECTED', (itemData) => {
            this.loadFurniture(itemData);
        });
    }

    async loadFurniture(itemData) {
        try {
            console.log(`AssetManager: Spawning new ${itemData.name}...`);

            // 1. Always load a fresh instance from the path provided in the JSON
            const gltf = await this.loader.loadAsync(itemData.modelPath);
            const model = gltf.scene;

            // 2. Attach the BIM Metadata directly to the 3D Object
            // This is CRITICAL so the InteractionManager and HUD can read it later
            model.userData = {
                ...itemData,
                isFurniture: true // Tells the Raycaster this is draggable
            };

            // 3. Set a unique name based on the UUID to avoid naming collisions
            model.name = `${itemData.id}_${THREE.MathUtils.generateUUID().substring(0, 8)}`;

            // 4. Initial Placement
            // We place it at (0, 0, 0) by default; the user will then drag it
            model.position.set(0, 0, 0);
            
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