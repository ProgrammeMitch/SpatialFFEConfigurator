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

        // NEW: Dedicated Spin State
        this.isSpinDragging = false;
        this.lastSafeRotation = 0;

        this.pointerDownPos = new THREE.Vector2();
        this.previousMouseX = 0;

        this.dragOffset = new THREE.Vector3();
        this.lastSafePosition = new THREE.Vector3();

        this.selectionBox = new THREE.BoxHelper(new THREE.Mesh());
        this.selectionBox.material.color.setHex(0x149650);
        this.selectionBox.visible = false;
        this.scene.add(this.selectionBox);

        // The Visual Rotation Handle
        this.rotationWidget = this.createRotationWidget();
        this.scene.add(this.rotationWidget);

        // Initialize the VR Info Panel
        this.vrInfoPanel = this.createVRInfoPanel();

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

        // Prevent the browser's right-click menu from popping up over the canvas
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Track our new panning state
        this.isPanning = false;
        this.previousPanX = 0;
        this.previousPanY = 0;
    }

    // --- NEW: PROCEDURAL UI WIDGET ---
    createRotationWidget() {
        const group = new THREE.Group();
        group.visible = false;
        group.renderOrder = 999; // Forces it to draw on top of the floor

        // The curved track (a 180-degree semi-circle)
        const trackGeo = new THREE.TorusGeometry(0.8, 0.03, 8, 32, Math.PI);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffb300, // FIX: Changed from Springfield Green to Bright Amber
            depthTest: false,
            transparent: true,
            opacity: 0.9
        });
        const track = new THREE.Mesh(trackGeo, mat);
        track.rotation.x = Math.PI / 2;

        // The arrow heads
        const arrowGeo = new THREE.ConeGeometry(0.12, 0.25, 8);

        const arrow1 = new THREE.Mesh(arrowGeo, mat);
        arrow1.position.set(0.8, 0, 0);
        arrow1.rotation.x = Math.PI / 2;

        const arrow2 = new THREE.Mesh(arrowGeo, mat);
        arrow2.position.set(-0.8, 0, 0);
        arrow2.rotation.x = Math.PI / 2;
        arrow2.rotation.z = Math.PI;

        group.add(track);
        group.add(arrow1);
        group.add(arrow2);

        // Invisible fat hit-box so it is easy to click with the mouse
        const hitGeo = new THREE.TorusGeometry(0.8, 0.2, 8, 32, Math.PI);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.rotation.x = Math.PI / 2;
        group.add(hitMesh);

        return group;
    }

    // --- NEW: VR FLOATING HUD ---
    createVRInfoPanel() {
        // 1. Create an invisible 2D Canvas in memory
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        this.vrCanvasContext = canvas.getContext('2d');

        // 2. Convert it into a Three.js Texture
        this.vrTexture = new THREE.CanvasTexture(canvas);
        this.vrTexture.minFilter = THREE.LinearFilter;

        // 3. Paste it onto a 3D Plane (80cm wide, 40cm tall)
        const mat = new THREE.MeshBasicMaterial({
            map: this.vrTexture,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false // Ensures it renders cleanly over other objects
        });

        const geo = new THREE.PlaneGeometry(0.8, 0.4);
        const mesh = new THREE.Mesh(geo, mat);

        mesh.visible = false;
        mesh.renderOrder = 999; // Force it to draw on top
        this.scene.add(mesh);

        return mesh;
    }

    updateVRInfoPanel(bimData, clearance) {
        const ctx = this.vrCanvasContext;

        // Clear the old drawing
        ctx.clearRect(0, 0, 512, 256);

        // Draw Dark Background with rounded corners
        ctx.fillStyle = 'rgba(34, 34, 34, 0.9)';
        ctx.beginPath();
        ctx.roundRect(0, 0, 512, 256, 16);
        ctx.fill();

        // Draw Springfield Green Border
        ctx.strokeStyle = '#149650';
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, 512, 256);

        // Draw Text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText(bimData.name || 'Selected Item', 30, 60);

        ctx.fillStyle = '#aaaaaa';
        ctx.font = '28px sans-serif';
        ctx.fillText(`Mfg: ${bimData.manufacturer || 'Springfield'}`, 30, 110);
        ctx.fillText(`Cat: ${bimData.category || 'N/A'}`, 30, 150);

        // Draw Clearance Distance (BULLETPROOF PARSING)
        ctx.fillStyle = '#ffb300'; // High-visibility Amber
        const validClearance = parseFloat(clearance);
        const distText = !isNaN(validClearance) ? validClearance.toFixed(2) + 'm' : '--';
        ctx.fillText(`Clearance: ${distText}`, 30, 210);

        // Crucial: Tell the GPU to update the image!
        this.vrTexture.needsUpdate = true;
    }

updateWidgetPosition() {
        if (!this.activeObject) return;

        const box = new THREE.Box3().setFromObject(this.activeObject);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // 1. Determine the TRUE world position of the active camera
        const cameraWorldPos = new THREE.Vector3();
        
        // FIX: If we are in VR, we must explicitly ask the WebXR renderer where the headset is!
        if (this.renderer.xr.isPresenting) {
            this.renderer.xr.getCamera().getWorldPosition(cameraWorldPos);
        } else {
            this.camera.getWorldPosition(cameraWorldPos);
        }

        // --- UPDATE THE ROTATION WIDGET ---
        this.rotationWidget.position.set(center.x, box.min.y + 0.02, center.z);
        
        const widgetTargetPos = cameraWorldPos.clone();
        widgetTargetPos.y = this.rotationWidget.position.y; 
        this.rotationWidget.lookAt(widgetTargetPos);

        // --- UPDATE THE VR INFO PANEL ---
        if (this.vrInfoPanel && this.vrInfoPanel.visible) {
            this.vrInfoPanel.position.set(center.x, box.max.y + 0.4, center.z);
            
            // Make the HUD look directly at the user's actual VR headset
            this.vrInfoPanel.lookAt(cameraWorldPos);
        }
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

    findFloorHit(raycaster) {
        const environments = this.getEnvironmentItems();
        const intersects = raycaster.intersectObjects(environments, true);
        const normalMatrix = new THREE.Matrix3();

        for (let hit of intersects) {
            if (hit.face) {
                normalMatrix.getNormalMatrix(hit.object.matrixWorld);
                const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
                if (worldNormal.y > 0.5) return hit;
            }
        }
        return null;
    }

    // --- DESKTOP LOGIC ---
    onPointerDown(event) {
        if (this.renderer.xr.isPresenting || this.isOrbitMode) return;

        // --- START PANNING LOGIC ---
        // event.button 1 is Middle Click (Scroll Wheel), 2 is Right Click
        if (event.button === 1 || event.button === 2) {
            this.isPanning = true;
            this.previousPanX = event.clientX;
            this.previousPanY = event.clientY;
            document.body.style.cursor = 'grabbing';
            return; // Stop here, don't try to grab furniture!
        }

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.pointerDownPos.set(event.clientX, event.clientY);
        this.previousMouseX = event.clientX;
        this.isActuallyDragging = false;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // 1. Check if we clicked the Rotation Widget FIRST
        if (this.rotationWidget.visible) {
            const widgetHits = this.raycaster.intersectObject(this.rotationWidget, true);
            if (widgetHits.length > 0) {
                this.isSpinDragging = true;
                this.lastSafeRotation = this.activeObject.rotation.y;
                document.body.style.cursor = 'ew-resize';
                return; // Stop here, we are spinning!
            }
        }

        // 2. Otherwise, check if we clicked Furniture for moving
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
            document.body.style.cursor = 'grabbing';
        } else {
            this.setActiveObject(null);
        }
    }

    onPointerMove(event) {
        if (this.renderer.xr.isPresenting || this.isOrbitMode) return;

        // --- NEW: ACTIVE PANNING LOGIC ---
        if (this.isPanning) {
            const deltaX = event.clientX - this.previousPanX;
            const deltaY = event.clientY - this.previousPanY;

            this.previousPanX = event.clientX;
            this.previousPanY = event.clientY;

            if (this.camera.isOrthographicCamera) {
                // Calculate exactly how many "world meters" a pixel represents at our current zoom
                const frustumWidth = (this.camera.right - this.camera.left) / this.camera.zoom;
                const frustumHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;

                const dx = (deltaX / window.innerWidth) * frustumWidth;
                const dz = (deltaY / window.innerHeight) * frustumHeight;

                // Move the camera in the opposite direction of the mouse to drag the "world"
                this.camera.position.x -= dx;
                this.camera.position.z -= dz;
            }
            return;
        }

        // SPIN MODE LOGIC
        if (this.isSpinDragging) {
            const deltaX = event.clientX - this.previousMouseX;
            this.activeObject.rotation.y += deltaX * 0.02;
            this.previousMouseX = event.clientX;

            this.selectionBox.update();
            this.updateWidgetPosition();

            const isColliding = this.checkAllCollisions(this.activeObject);
            this.selectionBox.material.color.setHex(isColliding ? 0xff0000 : 0x149650);

            // FIX: Give the arrow an ultra-bright yellow glow while actively dragging
            this.rotationWidget.children[0].material.color.setHex(0xffea00);
            return;
        }

        // MOVE MODE LOGIC
        if (!this.draggedObject) return;

        if (!this.isActuallyDragging) {
            const dist = this.pointerDownPos.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
            if (dist > 3) this.isActuallyDragging = true;
        }

        if (this.isActuallyDragging) {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);

            const floorHit = this.findFloorHit(this.raycaster);

            if (floorHit) {
                this.draggedObject.position.x = floorHit.point.x - this.dragOffset.x;
                this.draggedObject.position.z = floorHit.point.z - this.dragOffset.z;

                const box = new THREE.Box3().setFromObject(this.draggedObject);
                const originToBottomOffset = this.draggedObject.position.y - box.min.y;
                this.draggedObject.position.y = floorHit.point.y + originToBottomOffset;
            }

            this.selectionBox.setFromObject(this.draggedObject);
            this.selectionBox.visible = true;
            this.selectionBox.update();
            this.updateWidgetPosition();

            const isColliding = this.checkAllCollisions(this.draggedObject);
            this.selectionBox.material.color.setHex(isColliding ? 0xff0000 : 0x149650);
        }
    }

    onPointerUp() {

        if (this.isPanning) {
            this.isPanning = false;
            document.body.style.cursor = 'default';
            return;
        }

        // Handle dropping from Spin Mode
        if (this.isSpinDragging) {
            this.isSpinDragging = false;
            const isColliding = this.checkAllCollisions(this.activeObject);

            if (isColliding) {
                this.activeObject.rotation.y = this.lastSafeRotation;
                console.warn("InteractionManager: Hit a wall while spinning! Snapping back.");
            } else {
                this.lastSafeRotation = this.activeObject.rotation.y;
            }

            this.selectionBox.material.color.setHex(0x149650);
            this.selectionBox.update();
            this.updateWidgetPosition();

            // FIX: Reset back to the base Amber color when released
            this.rotationWidget.children[0].material.color.setHex(0xffb300);

            this.emitPlacement();
            document.body.style.cursor = 'default';
            return;
        }

        // Handle dropping from Move Mode
        if (this.draggedObject) {
            if (this.isActuallyDragging) {
                const isColliding = this.checkAllCollisions(this.draggedObject);

                if (isColliding) {
                    this.draggedObject.position.copy(this.lastSafePosition);
                    console.warn("InteractionManager: Hit a wall or void! Snapping back.");
                } else {
                    this.lastSafePosition.copy(this.draggedObject.position);
                }

                if (this.activeObject !== this.draggedObject) {
                    this.selectionBox.visible = false;
                    this.rotationWidget.visible = false;
                } else {
                    this.selectionBox.material.color.setHex(0x149650);
                    this.selectionBox.update();
                    this.updateWidgetPosition();
                }

                this.emitPlacement();
            } else {
                // It was a quick click to Select/Deselect
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
            this.rotationWidget.visible = true;

            // Render the VR HUD if we are inside the headset
            if (this.renderer.xr.isPresenting) {
                const clearance = MathUtils.getDistanceToNearestWall(object, this.scene);
                this.updateVRInfoPanel(object.userData, clearance);
                this.vrInfoPanel.visible = true;
            } else {
                this.vrInfoPanel.visible = false;
            }

            this.updateWidgetPosition();
        } else {
            this.selectionBox.visible = false;
            this.rotationWidget.visible = false;

            // NEW: Hide the VR HUD when deselected
            if (this.vrInfoPanel) this.vrInfoPanel.visible = false;
        }
    }

    emitPlacement() {
        // Use the active object if we were spinning, otherwise use the dragged object
        const targetObject = this.isSpinDragging ? this.activeObject : this.draggedObject;
        if (!targetObject) return;

        const clearance = MathUtils.getDistanceToNearestWall(targetObject, this.scene);
        globalEventBus.emit('FURNITURE_PLACED', {
            object: targetObject,
            bimData: targetObject.userData,
            position: targetObject.position.clone(),
            clearance: clearance
        });
    }

    // --- VR LOGIC ---
    onVRSelectStart(controller) {
        this.activeController = controller;
        this.isActuallyDragging = false;
        this.isVRSpinDragging = false;

        this.vrDownPos = controller.position.clone();
        this.previousVRX = controller.position.x;

        this.tempMatrix.identity().extractRotation(controller.matrixWorld);
        this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

        // 1. Check Widget
        if (this.rotationWidget.visible) {
            const widgetHits = this.raycaster.intersectObject(this.rotationWidget, true);
            if (widgetHits.length > 0) {
                this.isVRSpinDragging = true;
                this.lastSafeRotation = this.activeObject.rotation.y;
                return;
            }
        }

        // 2. Check Furniture
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
        if (!this.activeController) return;

        const dist = this.vrDownPos.distanceTo(this.activeController.position);
        if (dist > 0.05) this.isActuallyDragging = true;

        if (this.isActuallyDragging) {

            if (this.isVRSpinDragging) {
                const deltaX = this.activeController.position.x - this.previousVRX;
                this.activeObject.rotation.y += deltaX * 10;
                this.previousVRX = this.activeController.position.x;

                this.selectionBox.update();
                this.updateWidgetPosition();
                const isColliding = this.checkAllCollisions(this.activeObject);
                this.selectionBox.material.color.setHex(isColliding ? 0xff0000 : 0x149650);
                return;
            }

            if (this.draggedObject) {
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

                this.selectionBox.update();
                this.updateWidgetPosition();
                const isColliding = this.checkAllCollisions(this.draggedObject);
                this.selectionBox.material.color.setHex(isColliding ? 0xff0000 : 0x149650);
            }
        }
    }

    onVRSelectEnd() {
        if (this.isVRSpinDragging) {
            this.isVRSpinDragging = false;
            const isColliding = this.checkAllCollisions(this.activeObject);

            if (isColliding) {
                this.activeObject.rotation.y = this.lastSafeRotation;
                this.selectionBox.material.color.setHex(0x149650);
                this.selectionBox.update();
                this.updateWidgetPosition();
            }
            this.emitPlacement();
        }
        else if (this.draggedObject) {
            if (this.isActuallyDragging) {
                const isColliding = this.checkAllCollisions(this.draggedObject);

                if (isColliding) {
                    this.draggedObject.position.copy(this.lastSafePosition);
                    if (this.activeObject === this.draggedObject) {
                        this.selectionBox.material.color.setHex(0x149650);
                        this.selectionBox.update();
                        this.updateWidgetPosition();
                    }
                }
                this.emitPlacement();
            } else {
                this.setActiveObject(this.activeObject === this.draggedObject ? null : this.draggedObject);
            }
        }

        this.draggedObject = null;
        this.activeController = null;
    }

    // --- MASTER COLLISION CHECKER ---
    checkAllCollisions(object) {
        // 1. Check Walls and Void (using your existing raycaster logic)
        if (this.checkWallCollision(object)) return true;

        // 2. Check Furniture Overlaps using Bounding Boxes
        const objectBox = new THREE.Box3().setFromObject(object);

        // PRO-TIP: Shrink the bounding box by a tiny margin (e.g., 2cm)
        // This allows items to be pushed snugly side-by-side without triggering a false red alert
        objectBox.expandByScalar(-0.02);

        const allFurniture = this.getFurnitureItems();

        for (let otherItem of allFurniture) {
            // Don't test the object against itself
            if (otherItem === object) continue;

            const otherBox = new THREE.Box3().setFromObject(otherItem);
            otherBox.expandByScalar(-0.02); // Shrink the target box too

            // If the boxes overlap, we have a collision!
            if (objectBox.intersectsBox(otherBox)) {
                return true;
            }
        }

        // If it survived the walls and the furniture, it is a valid placement!
        return false;
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