import * as THREE from 'three';
import { VRButton } from '../../libs/VRButton.js'; 
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class WebXRManager {
    constructor(renderer, scene, interactionManager) {
        this.renderer = renderer;
        this.scene = scene;
        this.interactionManager = interactionManager;

        // 1. Properly initialize the custom VRButton
        // We pass options that the VRButton.js constructor expects
        const vrOptions = {
            sessionInit: { 
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] 
            },
            onSessionStart: () => {
                console.log("WebXRManager: VR Session Started");
                // The Engine handles camera swapping via renderer.xr listeners,
                // but we can trigger additional VR-only UI logic here if needed.
            },
            onSessionEnd: () => {
                console.log("WebXRManager: VR Session Ended");
            }
        };

        // Instantiate the button (it handles its own DOM attachment in your script)
        this.vrButton = new VRButton(this.renderer, vrOptions);

        // 2. Setup Controllers
        this.setupControllers();
    }

    setupControllers() {
        this.controller1 = this.renderer.xr.getController(0);
        this.controller2 = this.renderer.xr.getController(1);

        // Map the trigger (select) events to the InteractionManager
        this.controller1.addEventListener('selectstart', () => this.interactionManager.onVRSelectStart(this.controller1));
        this.controller1.addEventListener('selectend', () => this.interactionManager.onVRSelectEnd());
        
        this.controller2.addEventListener('selectstart', () => this.interactionManager.onVRSelectStart(this.controller2));
        this.controller2.addEventListener('selectend', () => this.interactionManager.onVRSelectEnd());

        this.scene.add(this.controller1);
        this.scene.add(this.controller2);

        // 3. Add Visual Laser Pointers for guidance
        const laserGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0), 
            new THREE.Vector3(0, 0, -5)
        ]);
        const laserMat = new THREE.LineBasicMaterial({ color: 0xffffff });
        const line = new THREE.Line(laserGeo, laserMat);
        
        this.controller1.add(line.clone());
        this.controller2.add(line.clone());

        // 4. Add 3D Controller Models
        const factory = new XRControllerModelFactory();
        
        this.grip1 = this.renderer.xr.getControllerGrip(0);
        this.grip1.add(factory.createControllerModel(this.grip1));
        this.scene.add(this.grip1);

        this.grip2 = this.renderer.xr.getControllerGrip(1);
        this.grip2.add(factory.createControllerModel(this.grip2));
        this.scene.add(this.grip2);
    }
}