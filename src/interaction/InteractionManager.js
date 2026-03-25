import * as THREE from 'three';
import { globalEventBus } from '../core/EventBus.js';
import { MathUtils } from '../utils/MathUtils.js';

export class InteractionManager {
    constructor(camera, scene, renderer) {
        this.camera = camera;
        this.scene = scene;
        this.renderer = renderer;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.tempMatrix = new THREE.Matrix4();

        // State Tracking
        this.draggedObject = null;
        this.activeObject = null;

        this.isOrbitMode = false;
        this.isActuallyDragging = false;
        this.pointerDownPos = new THREE.Vector2();
        this.previousMouseX = 0;

        // NEW: We no longer use a flat mathematical plane. 
        // We only need the offset to prevent the chair from snapping to the mouse center.
        this.dragOffset = new THREE.Vector3();
        this.lastSafePosition = new THREE.Vector3(); 

        this.selectionBox = new THREE.BoxHelper(new THREE.Mesh());
        this.selectionBox.material.color.setHex(0x149650);
        this.selectionBox.visible = false;
        this.scene.add(this.selectionBox);

        globalEventBus.on('ORBIT_TOGGLED', (isActive) => {
            this.isOrbitMode = isActive;
        });

        globalEventBus.on('REMOVE_FURNITURE', (uuid) => {
            if (this.activeObject && this.activeObject.uuid === uuid) {
                this.setActiveObject(null);
            }
        });

        const canvas = this.renderer.domElement;
        canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
        canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
        canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
    }

    getFurnitureItems() {
        const furniture = [];
        this.scene.traverse((child) => {
            if (child.userData.isFurniture) furniture.push(child);
        });
        return furniture;
    }

    getEnvironmentItems() {
        const environments = [];
        this.scene.traverse((child) => {
            if (child.userData.isEnvironment) environments.push(child);
        });
        return environments;
    }

    // --- NEW: TOPOGRAPHY RAYCASTER ---
    // Finds the exact elevation of the floor mesh currently underneath the mouse
    findFloorHit(raycaster) {
        const environments = this.getEnvironmentItems();
        const intersects = raycaster.intersectObjects(environments, true);
        const normalMatrix = new THREE.Matrix3();

        for (let hit of intersects) {
            if (hit.face) {
                normalMatrix.getNormalMatrix(hit.object.matrixWorld);
                const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
                
                // If the surface points UP, we treat it as a walkable floor/elevation
                if (worldNormal.y > 0.5) {
                    return hit;
                }
            }
        }
        return null; // Mouse is pointing into the void
    }

    // --- DESKTOP LOGIC ---
    onPointerDown(event) {
        if (this.renderer.xr.isPresenting || this.isOrbitMode) return;

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.pointerDownPos.set(event.clientX, event.clientY);
        this.previousMouseX = event.clientX;
        this.isActuallyDragging = false;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const furniture = this.getFurnitureItems();
        const intersects = this.raycaster.intersectObjects(furniture, true);

        if (intersects.length > 0) {
            let object = intersects[0].object;
            while (object.parent && !object.userData.isFurniture) object = object.parent;

            this.draggedObject = object;

            // NEW: Calculate drag offset based on the actual 3D topography
            const floorHit = this.findFloorHit(this.raycaster);
            if (floorHit) {
                this.dragOffset.copy(floorHit.point).sub(this.draggedObject.position);
                this.dragOffset.y = 0; // We only care about X/Z offset for grabbing!
            } else {
                this.dragOffset.set(0, 0, 0);
            }

            this.lastSafePosition.copy(this.draggedObject.position);
            document.body.style.cursor = 'grabbing';
        } else {
            this.setActiveObject(null);
        }
    }

    onPointerMove(event) {
        if (!this.draggedObject || this.renderer.xr.isPresenting || this.isOrbitMode) return;

        if (!this.isActuallyDragging) {
            const dist = this.pointerDownPos.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
            if (dist > 3) this.isActuallyDragging = true;
        }

        if (this.isActuallyDragging) {
            if (this.draggedObject === this.activeObject) {
                // SPIN MODE
                const deltaX = event.clientX - this.previousMouseX;
                this.draggedObject.rotation.y += deltaX * 0.01;
                this.previousMouseX = event.clientX;
            } else {
                // MOVE MODE (Terrain Hugging)
                this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
                this.raycaster.setFromCamera(this.mouse, this.camera);

                const floorHit = this.findFloorHit(this.raycaster);

                if (floorHit) {
                    // 1. Move X and Z
                    this.draggedObject.position.x = floorHit.point.x - this.dragOffset.x;
                    this.draggedObject.position.z = floorHit.point.z - this.dragOffset.z;

                    // 2. Dynamic Y Adjustment
                    // We calculate the distance from the object's mathematical center to its physical bottom,
                    // then we sit that physical bottom precisely on the floorHit elevation.
                    const box = new THREE.Box3().setFromObject(this.draggedObject);
                    const originToBottomOffset = this.draggedObject.position.y - box.min.y;
                    
                    this.draggedObject.position.y = floorHit.point.y + originToBottomOffset;
                }
            }

            this.selectionBox.setFromObject(this.draggedObject);
            this.selectionBox.visible = true;
            this.selectionBox.update();

            const isColliding = this.checkWallCollision(this.draggedObject);
            this.selectionBox.material.color.setHex(isColliding ? 0xff0000 : 0x149650);
        }
    }

    onPointerUp() {
        if (this.draggedObject) {
            if (this.isActuallyDragging) {
                const isColliding = this.checkWallCollision(this.draggedObject);

                if (isColliding) {
                    this.draggedObject.position.copy(this.lastSafePosition);
                    console.warn("InteractionManager: Hit a wall or void! Snapping back.");
                } else {
                    this.lastSafePosition.copy(this.draggedObject.position);
                }

                if (this.activeObject !== this.draggedObject) {
                    this.selectionBox.visible = false;
                } else {
                    this.selectionBox.material.color.setHex(0x149650);
                    this.selectionBox.update();
                }

                this.emitPlacement();
            } else {
                if (this.activeObject === this.draggedObject) {
                    this.setActiveObject(null);
                } else {
                    this.setActiveObject(this.draggedObject);
                }
            }
        }

        this.draggedObject = null;
        document.body.style.cursor = 'default';
    }

    setActiveObject(object) {
        this.activeObject = object;
        if (object) {
            this.selectionBox.setFromObject(object);
            this.selectionBox.material.color.setHex(0x149650);
            this.selectionBox.visible = true;
        } else {
            this.selectionBox.visible = false;
        }
    }

    emitPlacement() {
        const clearance = MathUtils.getDistanceToNearestWall(this.draggedObject, this.scene);
        globalEventBus.emit('FURNITURE_PLACED', {
            object: this.draggedObject,
            bimData: this.draggedObject.userData,
            position: this.draggedObject.position.clone(),
            clearance: clearance
        });
    }

    // --- VR LOGIC (Terrain Hugging) ---
    onVRSelectStart(controller) {
        this.activeController = controller;
        this.isActuallyDragging = false;
        this.vrDownPos = controller.position.clone();
        this.previousVRX = controller.position.x;

        this.tempMatrix.identity().extractRotation(controller.matrixWorld);
        this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

        const furniture = this.getFurnitureItems();
        const intersects = this.raycaster.intersectObjects(furniture, true);

        if (intersects.length > 0) {
            let object = intersects[0].object;
            while (object.parent && !object.userData.isFurniture) object = object.parent;

            this.draggedObject = object;
            
            const floorHit = this.findFloorHit(this.raycaster);
            if (floorHit) {
                this.dragOffset.copy(floorHit.point).sub(this.draggedObject.position);
                this.dragOffset.y = 0; 
            } else {
                this.dragOffset.set(0, 0, 0);
            }

            this.lastSafePosition.copy(this.draggedObject.position);
        } else {
            this.setActiveObject(null);
        }
    }

    updateVRDrag() {
        if (!this.draggedObject || !this.activeController) return;

        const dist = this.vrDownPos.distanceTo(this.activeController.position);
        if (dist > 0.05) this.isActuallyDragging = true;

        if (this.isActuallyDragging) {
            if (this.draggedObject === this.activeObject) {
                const deltaX = this.activeController.position.x - this.previousVRX;
                this.draggedObject.rotation.y += deltaX * 10;
                this.previousVRX = this.activeController.position.x;
            } else {
                this.tempMatrix.identity().extractRotation(this.activeController.matrixWorld);
                this.raycaster.ray.origin.setFromMatrixPosition(this.activeController.matrixWorld);
                this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

                const floorHit = this.findFloorHit(this.raycaster);

                if (floorHit) {
                    this.draggedObject.position.x = floorHit.point.x - this.dragOffset.x;
                    this.draggedObject.position.z = floorHit.point.z - this.dragOffset.z;

                    const box = new THREE.Box3().setFromObject(this.draggedObject);
                    const originToBottomOffset = this.draggedObject.position.y - box.min.y;
                    this.draggedObject.position.y = floorHit.point.y + originToBottomOffset;
                }
            }

            if (this.activeObject === this.draggedObject) {
                this.selectionBox.update();
                const isColliding = this.checkWallCollision(this.draggedObject);
                this.selectionBox.material.color.setHex(isColliding ? 0xff0000 : 0x149650);
            }
        }
    }

    onVRSelectEnd() {
        if (this.draggedObject) {
            if (this.isActuallyDragging) {
                const isColliding = this.checkWallCollision(this.draggedObject);

                if (isColliding) {
                    this.draggedObject.position.copy(this.lastSafePosition);
                    if (this.activeObject === this.draggedObject) {
                        this.selectionBox.material.color.setHex(0x149650);
                        this.selectionBox.update();
                    }
                } else {
                    this.lastSafePosition.copy(this.draggedObject.position);
                }
                this.emitPlacement();
            } else {
                this.setActiveObject(this.activeObject === this.draggedObject ? null : this.draggedObject);
            }
        }
        this.draggedObject = null;
        this.activeController = null;
    }

    // --- UNIVERSAL COLLISION MATH ---
    checkWallCollision(object) {
        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        box.getSize(size);

        const rayHeight = box.min.y + (size.y * 0.5);
        const maxDistX = (size.x / 2) + 0.1;
        const maxDistZ = (size.z / 2) + 0.1;

        const whiskers = [
            { dir: new THREE.Vector3(1, 0, 0), length: maxDistX },
            { dir: new THREE.Vector3(-1, 0, 0), length: maxDistX },
            { dir: new THREE.Vector3(0, 0, 1), length: maxDistZ },
            { dir: new THREE.Vector3(0, 0, -1), length: maxDistZ },
            { dir: new THREE.Vector3(1, 0, 1).normalize(), length: Math.max(maxDistX, maxDistZ) },
            { dir: new THREE.Vector3(-1, 0, 1).normalize(), length: Math.max(maxDistX, maxDistZ) },
            { dir: new THREE.Vector3(1, 0, -1).normalize(), length: Math.max(maxDistX, maxDistZ) },
            { dir: new THREE.Vector3(-1, 0, -1).normalize(), length: Math.max(maxDistX, maxDistZ) }
        ];

        const environments = this.getEnvironmentItems();
        const originalFar = this.raycaster.far;
        const origin = new THREE.Vector3(box.min.x + (size.x / 2), rayHeight, box.min.z + (size.z / 2));
        const normalMatrix = new THREE.Matrix3();

        // 1. THE WALL CHECK
        for (let whisker of whiskers) {
            this.raycaster.set(origin, whisker.dir);
            this.raycaster.far = whisker.length;

            const intersects = this.raycaster.intersectObjects(environments, true);
            
            for (let hit of intersects) {
                if (hit.face) {
                    normalMatrix.getNormalMatrix(hit.object.matrixWorld);
                    const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
                    
                    if (Math.abs(worldNormal.y) < 0.5) {
                        this.raycaster.far = originalFar;
                        return true;
                    }
                }
            }
        }

        // 2. THE VOID CHECK
        this.raycaster.set(origin, new THREE.Vector3(0, -1, 0));
        this.raycaster.far = rayHeight + 1.0;
        const floorHits = this.raycaster.intersectObjects(environments, true);
        
        let hasFloor = false;
        for (let hit of floorHits) {
            if (hit.face) {
                normalMatrix.getNormalMatrix(hit.object.matrixWorld);
                const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
                
                if (worldNormal.y > 0.5) {
                    hasFloor = true;
                    break;
                }
            }
        }

        this.raycaster.far = originalFar;
        if (!hasFloor) return true;

        return false;
    }
}