import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { globalEventBus } from '../core/EventBus.js';

export class EnvironmentManager {
    // FIX 1: Added stateManager as a constructor argument here!
    constructor(scene, stateManager) {
        this.scene = scene;
        this.stateManager = stateManager; 
        this.loader = new GLTFLoader();
        this.currentRoom = null;

        globalEventBus.on('ROOM_SELECTED', async (roomData) => {
            await this.handleRoomSwap(roomData);
        });
    }

    async handleRoomSwap(roomData) {
        // 1. THE SAFETY LOCK
        const currentItems = this.stateManager.getLayoutData();
        if (currentItems.length > 0) {
            alert("Please remove all furniture from the current room before loading a new one.");
            console.warn("EnvironmentManager: Swap rejected. Room is not empty.");
            return;
        }

        // 2. Unload the old room
        if (this.currentRoom) {
            this.scene.remove(this.currentRoom);
            this.currentRoom = null; 
        }

        // 3. Load the new room
        try {
            console.log(`EnvironmentManager: Loading ${roomData.name}...`);
            const gltf = await this.loader.loadAsync(roomData.modelPath);
            this.currentRoom = gltf.scene;

            // Tag for physics AND apply architectural styling
            this.currentRoom.traverse((child) => {
                if (child.isMesh) {
                    child.userData.isEnvironment = true; 
                    child.receiveShadow = true;

                    // FIX 2: Restored the CAD Edge Lines for the walls!
                    if (child.material) {
                        child.material = child.material.clone();
                        child.material.color.setHex(0xe8e8e8); 
                    }

                    const edges = new THREE.EdgesGeometry(child.geometry);
                    const line = new THREE.LineSegments(
                        edges, 
                        new THREE.LineBasicMaterial({ color: 0x222222, linewidth: 2 })
                    );
                    child.add(line);
                }
            });

            this.currentRoom.position.set(0, 0, 0);
            this.scene.add(this.currentRoom);

            console.log(`EnvironmentManager: ${roomData.name} loaded successfully.`);
            globalEventBus.emit('ENVIRONMENT_READY', this.currentRoom);

        } catch (error) {
            console.error('EnvironmentManager: Failed to load room.', error);
        }
    }

    buildFallbackEnvironment() {
        console.warn('EnvironmentManager: Building fallback grid floor.');
        
        const floorGeo = new THREE.PlaneGeometry(1000, 1000);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        
        floor.rotation.x = -Math.PI / 2; 
        floor.userData.isEnvironment = true; 
        floor.receiveShadow = true;

        const gridHelper = new THREE.GridHelper(1000, 1000);
        gridHelper.position.y = 0.01; 

        this.scene.add(floor);
        this.scene.add(gridHelper);
        
        this.currentRoom = floor;
        globalEventBus.emit('ENVIRONMENT_READY', this.currentRoom);
    }
}