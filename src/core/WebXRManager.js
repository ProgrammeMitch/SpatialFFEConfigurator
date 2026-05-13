import * as THREE from 'three';
import { VRButton } from '../../libs/VRButton.js'; 
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class WebXRManager {
    // NEW: Accept vrRig as the 4th argument
    constructor(renderer, scene, interactionManager, vrRig) {
        this.renderer = renderer;
        this.scene = scene;
        this.interactionManager = interactionManager;
        this.vrRig = vrRig; // Store the rig so we can attach controllers to it

        const vrOptions = {
            sessionInit: { 
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] 
            },
            onSessionStart: () => {
                console.log("WebXRManager: VR Session Started");
            },
            onSessionEnd: () => {
                console.log("WebXRManager: VR Session Ended");
            }
        };

        this.vrButton = new VRButton(this.renderer, vrOptions);

        this.setupControllers();
    }

    setupControllers() {
        this.controller1 = this.renderer.xr.getController(0);
        this.controller2 = this.renderer.xr.getController(1);

        this.controller1.addEventListener('selectstart', () => this.interactionManager.onVRSelectStart(this.controller1));
        this.controller1.addEventListener('selectend', () => this.interactionManager.onVRSelectEnd());
        
        this.controller2.addEventListener('selectstart', () => this.interactionManager.onVRSelectStart(this.controller2));
        this.controller2.addEventListener('selectend', () => this.interactionManager.onVRSelectEnd());

        // FIX: Attach the controllers to the VR Rig, not the floor!
        this.vrRig.add(this.controller1);
        this.vrRig.add(this.controller2);

        // Visual Laser Pointers
        const laserGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0), 
            new THREE.Vector3(0, 0, -5)
        ]);
        const laserMat = new THREE.LineBasicMaterial({ color: 0xffffff });
        const line = new THREE.Line(laserGeo, laserMat);
        
        this.controller1.add(line.clone());
        this.controller2.add(line.clone());

        // 3D Controller Models
        const factory = new XRControllerModelFactory();
        
        this.grip1 = this.renderer.xr.getControllerGrip(0);
        this.grip1.add(factory.createControllerModel(this.grip1));
        // FIX: Attach the 3D models to the VR Rig!
        this.vrRig.add(this.grip1);

        this.grip2 = this.renderer.xr.getControllerGrip(1);
        this.grip2.add(factory.createControllerModel(this.grip2));
        // FIX: Attach the 3D models to the VR Rig!
        this.vrRig.add(this.grip2);
    }
}